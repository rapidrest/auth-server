///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Regression test for the chart's `cors__origins`: it once quoted each origin inside the list *and* again when
// the list was serialized, so the env var held `["\"https://x\"", ...]` — every entry carrying literal quote
// characters. The server then sent no `Access-Control-Allow-Origin` for anyone, and `toTrustedOrigins()` dropped
// every entry (`new URL('"https://x"')` throws), so `?return_to=` was never honored.
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";
import { toTrustedOrigins } from "../src/routes/TrustedOrigins.js";

const CHART_DIR = resolve(__dirname, "../helm");
const helmAvailable = spawnSync("helm", ["version", "--short"]).status === 0;

describe("service-config.yaml cors__origins (source)", () => {
    const template = readFileSync(join(CHART_DIR, "templates/0_config/service-config.yaml"), "utf8");

    it("does not quote an origin before it is serialized to JSON", () => {
        const append = template.split("\n").find((line) => line.includes("append $origins"));
        expect(append).toBeDefined();
        expect(append).not.toMatch(/\bquote\b/);
    });
});

describe.skipIf(!helmAvailable)("service-config.yaml cors__origins (helm template)", () => {
    // `helm template` refuses a chart whose declared subcharts are missing from `charts/`, and those tarballs are
    // git-ignored, so render a copy without the dependency list — nothing under test uses a subchart.
    const workDir = mkdtempSync(join(tmpdir(), "auth-server-chart-"));
    const chart = join(workDir, "helm");
    cpSync(CHART_DIR, chart, { recursive: true });
    rmSync(join(chart, "charts"), { recursive: true, force: true });
    rmSync(join(chart, "Chart.lock"), { force: true });
    const meta = load(readFileSync(join(chart, "Chart.yaml"), "utf8")) as Record<string, unknown>;
    delete meta.dependencies;
    writeFileSync(join(chart, "Chart.yaml"), JSON.stringify(meta));

    afterAll(() => rmSync(workDir, { recursive: true, force: true }));

    function renderData(...sets: string[]): Record<string, string> {
        const args = [
            "template",
            "t",
            chart,
            "--show-only",
            "templates/0_config/service-config.yaml",
            "--set",
            "global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=example.com",
            "--set",
            "mongodb.create=false,redis.create=false",
            ...sets.flatMap((set) => ["--set", set]),
        ];
        const result = spawnSync("helm", args, { encoding: "utf8" });
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        return (load(result.stdout) as { data: Record<string, string> }).data;
    }

    function renderOrigins(...sets: string[]): string {
        return renderData(...sets).cors__origins;
    }

    it("renders a plain JSON array of un-quoted origins", () => {
        const value = renderOrigins("global.corsHosts={localhost:3000,mail.example.com}");
        expect(JSON.parse(value)).toEqual([
            "https://localhost:3000",
            "https://mail.example.com",
            "https://auth.example.com",
        ]);
    });

    it("renders both schemes when TLS is on without HSTS, and only http when TLS is off", () => {
        expect(JSON.parse(renderOrigins("global.gateway.hsts=false", "global.corsHosts={mail.example.com}"))).toEqual([
            "http://mail.example.com",
            "https://mail.example.com",
            "http://auth.example.com",
            "https://auth.example.com",
        ]);
        expect(JSON.parse(renderOrigins("global.gateway.tls=false", "global.corsHosts={mail.example.com}"))).toEqual([
            "http://mail.example.com",
            "http://auth.example.com",
        ]);
    });

    it("renders origins the server accepts as a return_to allowlist", () => {
        const value = renderOrigins("global.corsHosts={localhost:3000,mail.example.com}");
        expect(toTrustedOrigins(JSON.parse(value))).toEqual([
            "https://localhost:3000",
            "https://mail.example.com",
            "https://auth.example.com",
        ]);
    });

    // Regression test: cors__origins/trusted_proxies/NODE_ENV are chart-derived defaults, gathered with every other
    // one into a single `$defaults` dict and only emitted when `service.config` doesn't already set that key — a
    // YAML mapping can't hold the same key twice, so setting one of these through `service.config` used to render a
    // ConfigMap `helm template`/`kubectl apply` both reject outright, rather than actually overriding anything.
    it("lets service.config override cors__origins, trusted_proxies and NODE_ENV, each exactly once in the render", () => {
        const data = renderData(
            "service.config.cors__origins={https://override.example}",
            "service.config.trusted_proxies={10.10.0.0/16}",
            "service.config.NODE_ENV=staging",
        );
        expect(JSON.parse(data.cors__origins)).toEqual(["https://override.example"]);
        expect(JSON.parse(data.trusted_proxies)).toEqual(["10.10.0.0/16"]);
        expect(data.NODE_ENV).toBe("staging");
    });
});
