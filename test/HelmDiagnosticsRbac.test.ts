///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// The admin console's Diagnostics page reads the namespace's pods, volume claims and pod metrics from the Kubernetes
// API with the server pod's own ServiceAccount. That must be granted by a namespace-scoped, read-only Role bound to
// the chart's ServiceAccount, never to the namespace's shared "default" one — this pins that down.
import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { loadAll, load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

const CHART_DIR = resolve(__dirname, "../helm");
const helmAvailable = spawnSync("helm", ["version", "--short"]).status === 0;

describe.skipIf(!helmAvailable)("diagnostics-rbac.yaml (helm template)", () => {
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

    function render(...sets: string[]): any[] {
        const args = [
            "template",
            "t",
            chart,
            "--namespace",
            "auth-ns",
            "--show-only",
            "templates/0_config/diagnostics-rbac.yaml",
            "--set",
            "global.secrets.cookies=c,global.secrets.sessions=s,global.jwt.secret=j,global.domain=example.com",
            "--set",
            "mongodb.create=false,redis.create=false",
            ...sets.flatMap((set) => ["--set", set]),
        ];
        const result = spawnSync("helm", args, { encoding: "utf8" });
        if (result.status !== 0) {
            // `--show-only` fails when the template renders to nothing.
            expect(result.stderr).toContain("could not find template");
            return [];
        }
        return loadAll(result.stdout).filter(Boolean);
    }

    it("grants read-only access to pods, claims and pod metrics, in the release's namespace only", () => {
        const [role] = render();
        expect(role.kind).toBe("Role");
        expect(role.rules).toEqual([
            { apiGroups: [""], resources: ["pods", "persistentvolumeclaims"], verbs: ["get", "list"] },
            { apiGroups: ["metrics.k8s.io"], resources: ["pods"], verbs: ["get", "list"] },
        ]);
    });

    it("binds the Role to the chart's own ServiceAccount", () => {
        const [role, binding] = render();
        expect(binding.kind).toBe("RoleBinding");
        expect(binding.roleRef).toEqual({ apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: role.metadata.name });
        expect(binding.subjects).toEqual([{ kind: "ServiceAccount", name: "t-auth-server", namespace: "auth-ns" }]);
    });

    it("binds to a ServiceAccount named in the values", () => {
        const [, binding] = render("global.serviceAccount.name=custom");
        expect(binding.subjects[0].name).toBe("custom");
    });

    it("is not rendered when turned off", () => {
        expect(render("global.diagnostics.rbac.create=false")).toEqual([]);
    });

    it("is not rendered when there is no dedicated ServiceAccount to bind to", () => {
        expect(render("global.serviceAccount.create=false")).toEqual([]);
    });

    it("binds to an existing ServiceAccount when the chart isn't creating one", () => {
        const [, binding] = render("global.serviceAccount.create=false,global.serviceAccount.name=existing");
        expect(binding.subjects[0].name).toBe("existing");
    });
});
