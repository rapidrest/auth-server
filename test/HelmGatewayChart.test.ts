///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Regression tests for the Helm chart's secrets, gateway and probe images (rendered with `helm template`):
//  - the stored JWT secret is read back from the Secret's `auth__secret` key (not the whole data map),
//  - local hosts are recognised by suffix (`.local`, `.localhost`), not by substring,
//  - plain HTTP is redirected to HTTPS when the chart owns the Gateway and terminates TLS there,
//  - the busybox images are pinned and `helm test` targets the chart's real Service.
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { loadAll, load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

const CHART_DIR = resolve(__dirname, "../helm");
const helmAvailable = spawnSync("helm", ["version", "--short"]).status === 0;

describe.skipIf(!helmAvailable)("chart gateway, secrets and images (helm template)", () => {
    // See HelmCorsOrigins.test.ts for why the chart is copied and rendered without its subchart dependencies.
    const workDir = mkdtempSync(join(tmpdir(), "auth-server-chart-gateway-"));
    const chart = join(workDir, "helm");
    cpSync(CHART_DIR, chart, { recursive: true });
    rmSync(join(chart, "charts"), { recursive: true, force: true });
    rmSync(join(chart, "Chart.lock"), { force: true });
    const meta = load(readFileSync(join(chart, "Chart.yaml"), "utf8")) as Record<string, unknown>;
    delete meta.dependencies;
    writeFileSync(join(chart, "Chart.yaml"), JSON.stringify(meta));

    afterAll(() => rmSync(workDir, { recursive: true, force: true }));

    function run(domain: string, ...sets: string[]) {
        return spawnSync(
            "helm",
            [
                "template",
                "t",
                chart,
                "--namespace",
                "auth-ns",
                "--set",
                `global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=${domain}`,
                "--set",
                "mongodb.create=false,redis.create=false,postgresql.create=false",
                "--api-versions",
                "gateway.networking.k8s.io/v1",
                "--show-only",
                "templates/3_gateways/service.yaml",
                "--show-only",
                "templates/0_config/tls-certs.yaml",
                ...sets.flatMap((set) => ["--set", set]),
            ],
            { encoding: "utf8" },
        );
    }

    function docs(domain: string, ...sets: string[]): any[] {
        const result = run(domain, ...sets);
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        return loadAll(result.stdout).filter(Boolean) as any[];
    }

    const kinds = (list: any[], kind: string) => list.filter((d) => d.kind === kind);
    const sections = (route: any) => route.spec.parentRefs.map((p: any) => p.sectionName);

    it("redirects http to https and attaches the app route to the https listener only", () => {
        const list = docs("example.com");
        const routes = kinds(list, "HTTPRoute");
        const app = routes.find((r) => r.metadata.name === "t-auth-server-httproute" || !r.spec.rules[0].filters?.some((f: any) => f.type === "RequestRedirect"));
        const redirect = routes.find((r) => r.spec.rules[0].filters?.some((f: any) => f.type === "RequestRedirect"));
        expect(redirect).toBeDefined();
        expect(sections(redirect)).toEqual(["http"]);
        expect(redirect.spec.rules[0].filters[0].requestRedirect).toEqual({ scheme: "https", statusCode: 301 });
        expect(sections(app)).toEqual(["https"]);
        expect(routes).toHaveLength(2);
    });

    it("serves both listeners without a redirect when global.gateway.httpRedirect is false", () => {
        const routes = kinds(docs("example.com", "global.gateway.httpRedirect=false"), "HTTPRoute");
        expect(routes).toHaveLength(1);
        expect(sections(routes[0])).toEqual(["http", "https"]);
    });

    it("renders no redirect when there is no certificate", () => {
        const routes = kinds(docs("example.com", "global.gateway.tls=false"), "HTTPRoute");
        expect(routes).toHaveLength(1);
        expect(sections(routes[0])).toEqual(["http"]);
    });

    it("renders no redirect on a Gateway the chart does not own", () => {
        const routes = kinds(docs("example.com", "global.gateway.name=shared,global.gateway.namespace=gw"), "HTTPRoute");
        expect(routes).toHaveLength(1);
        expect(routes[0].spec.parentRefs[0].sectionName).toBeUndefined();
    });

    it("decides on a certificate by host suffix, not substring", () => {
        // "my.localized.example.com" contains ".local" but is a public name.
        const pub = docs("localized.example.com");
        expect(kinds(pub, "Certificate")).toHaveLength(1);
        expect(kinds(pub, "Gateway")[0].spec.listeners.map((l: any) => l.name)).toContain("https");

        for (const domain of ["domain.local", "dev.localhost"]) {
            const list = docs(domain);
            expect(kinds(list, "Certificate")).toHaveLength(0);
            expect(kinds(list, "Gateway")[0].spec.listeners.map((l: any) => l.name)).toEqual(["http"]);
        }
    });

    it("pins the probe image and points helm test at the chart's Service", () => {
        const test = spawnSync(
            "helm",
            ["template", "t", chart, "--set", "global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=example.com,mongodb.create=false,redis.create=false", "--show-only", "templates/tests/test-connection.yaml"],
            { encoding: "utf8" },
        );
        expect(test.status).toBe(0);
        const pod = load(test.stdout) as any;
        expect(pod.spec.containers[0].image).toBe("busybox:1.37.0");
        expect(pod.spec.containers[0].args).toEqual(["t-auth-server-services"]);

        const dep = spawnSync(
            "helm",
            ["template", "t", chart, "--set", "global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=example.com,mongodb.create=true,postgresql.create=true,redis.create=true", "--show-only", "templates/1_deployments/service.yaml"],
            { encoding: "utf8" },
        );
        expect(dep.stdout).not.toMatch(/image: busybox\s*$/m);
        expect(dep.stdout).toMatch(/image: busybox:1\.37\.0/);
    });

    it("keeps a stored JWT secret on upgrade source-wise: passes the auth__secret key, not the data map", () => {
        const src = readFileSync(join(CHART_DIR, "templates/0_config/jwt-auth.yaml"), "utf8");
        expect(src).toContain('"stored" (get $secretData "auth__secret")');
    });
});
