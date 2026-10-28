///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The External Secrets SecretStore verifies OpenBao's TLS listener with the CA in global.openbao.caConfigMap (key ca.crt),
// the same shape the RapidMX server chart renders. Unset, nothing is rendered.
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { loadAll, load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

const CHART_DIR = resolve(__dirname, "../helm");
const helmAvailable = spawnSync("helm", ["version", "--short"]).status === 0;

describe.skipIf(!helmAvailable)("external-secrets.yaml caProvider (helm template)", () => {
    // See HelmCorsOrigins.test.ts: `helm template` refuses a chart whose subcharts are missing from `charts/`.
    const workDir = mkdtempSync(join(tmpdir(), "auth-server-chart-"));
    const chart = join(workDir, "helm");
    cpSync(CHART_DIR, chart, { recursive: true });
    rmSync(join(chart, "charts"), { recursive: true, force: true });
    rmSync(join(chart, "Chart.lock"), { force: true });
    const meta = load(readFileSync(join(chart, "Chart.yaml"), "utf8")) as Record<string, unknown>;
    delete meta.dependencies;
    writeFileSync(join(chart, "Chart.yaml"), JSON.stringify(meta));

    afterAll(() => rmSync(workDir, { recursive: true, force: true }));

    function store(...sets: string[]): any {
        const args = [
            "template",
            "t",
            chart,
            "--namespace",
            "auth-ns",
            "--api-versions",
            "external-secrets.io/v1",
            "--show-only",
            "templates/4_vault/external-secrets.yaml",
            "--set",
            "global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=example.com",
            "--set",
            "mongodb.create=false,redis.create=false",
            "--set",
            "global.externalSecrets.enabled=true,global.openbao.enabled=true,global.openbao.address=https://openbao.openbao.svc:8200",
            ...sets.flatMap((set) => ["--set", set]),
        ];
        const result = spawnSync("helm", args, { encoding: "utf8" });
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        return loadAll(result.stdout).find((d: any) => d?.kind === "SecretStore");
    }

    it("renders no caProvider when caConfigMap is unset", () => {
        const s = store();
        expect(s.spec.provider.vault.caProvider).toBeUndefined();
        expect(s.spec.provider.vault.server).toBe("https://openbao.openbao.svc:8200");
    });

    it("renders the ConfigMap's ca.crt as the caProvider when caConfigMap is set", () => {
        const s = store("global.openbao.caConfigMap=rapidmx-server-openbao-ca");
        expect(s.spec.provider.vault.caProvider).toEqual({ type: "ConfigMap", name: "rapidmx-server-openbao-ca", key: "ca.crt" });
        expect(s.spec.provider.vault.auth).toBeDefined();
    });
});
