///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Regression test for the chart never setting `auth:passkey`/`auth:fido2`'s `rpID`/`origin`: without them, both
// fall back to `@rapidrest/auth`'s built-in defaults (rpID "rapidrest", origin "http://localhost:3000"), which
// don't match a real deployment's domain. WebAuthn refuses even to start when the relying-party ID doesn't match
// the page's own domain, so every "Add a passkey"/"Add a security key" attempt failed instantly in the browser
// with a `SecurityError`, before any prompt appeared — see `PasskeySecretForm.tsx`/`Fido2SecretForm.tsx`, which
// only ever showed a generic "Could not add a passkey." for it (also fixed, to surface the real browser error).
// The service-config.yaml ConfigMap's keys reach the container verbatim via `envFrom: configMapRef` (confirmed
// in `service.yaml`), so `auth__passkey__rpID`'s mixed case matters: nconf's env parsing (`separator: "__"`,
// no case-folding) only reaches `config.get("auth:passkey:rpID")` — and the code reads `rpID` off that object as
// a plain JS property — if every segment's case matches exactly, the same case-sensitivity `site_settings`'s
// own env vars already need (see `.claude/NOTES.md`).
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

const CHART_DIR = resolve(__dirname, "../helm");
const helmAvailable = spawnSync("helm", ["version", "--short"]).status === 0;

describe("service-config.yaml auth__passkey__*/auth__fido2__* (source)", () => {
    const template = readFileSync(join(CHART_DIR, "templates/0_config/service-config.yaml"), "utf8");

    it("sets the rpID and origin for both passkey and fido2, with rpID's case preserved", () => {
        for (const key of ["auth__passkey__rpID", "auth__passkey__origin", "auth__fido2__rpID", "auth__fido2__origin"]) {
            expect(template).toContain(`"${key}"`);
        }
    });

    it("never emits a key service.config already sets, since a YAML mapping can't hold the same key twice", () => {
        expect(template).toMatch(/hasKey \$\.Values\.service\.config \$k/);
    });
});

describe.skipIf(!helmAvailable)("service-config.yaml auth__passkey__*/auth__fido2__* (helm template)", () => {
    // See HelmCorsOrigins.test.ts for why the chart is copied and rendered without its subchart dependencies.
    const workDir = mkdtempSync(join(tmpdir(), "auth-server-chart-passkey-"));
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

    it("defaults both to this server's own host, at the preferred https origin, with no port", () => {
        const data = renderData();
        expect(data.auth__passkey__rpID).toBe("auth.example.com");
        expect(data.auth__passkey__origin).toBe("https://auth.example.com");
        expect(data.auth__fido2__rpID).toBe("auth.example.com");
        expect(data.auth__fido2__origin).toBe("https://auth.example.com");
    });

    it("still prefers https when TLS is on without HSTS", () => {
        const data = renderData("global.gateway.hsts=false");
        expect(data.auth__passkey__origin).toBe("https://auth.example.com");
    });

    it("falls back to http when TLS is off", () => {
        const data = renderData("global.gateway.tls=false");
        expect(data.auth__passkey__origin).toBe("http://auth.example.com");
        expect(data.auth__fido2__origin).toBe("http://auth.example.com");
    });

    it("follows a custom host, ignoring the other apps listed in corsHosts", () => {
        const data = renderData("host=auth.rapidmx.test", "global.corsHosts={mail.rapidmx.test}");
        expect(data.auth__passkey__rpID).toBe("auth.rapidmx.test");
        expect(data.auth__passkey__origin).toBe("https://auth.rapidmx.test");
    });

    it("service.config can still override the default", () => {
        const data = renderData("service.config.auth__passkey__rpID=override.example.com");
        expect(data.auth__passkey__rpID).toBe("override.example.com");
    });
});
