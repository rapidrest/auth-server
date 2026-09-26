///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level coverage for BaseDiagnosticsRoute's own logic against stubbed datastores and a stubbed Kubernetes
// API. The pieces it composes (`src/diagnostics/*`) have their own tests.
import { describe, expect, it, vi } from "vitest";
import { BaseDiagnosticsRoute } from "../src/routes/BaseDiagnosticsRoute.js";
import type { KubeContext } from "../src/diagnostics/KubernetesInfo.js";
import { DiagnosticsRoute as MongoDiagnosticsRoute } from "../src/mongo/routes/DiagnosticsRoute.js";
import { DiagnosticsRoute as SqlDiagnosticsRoute } from "../src/sql/routes/DiagnosticsRoute.js";

class TestRoute extends BaseDiagnosticsRoute {
    protected primaryDatastore?: any;
    protected primaryKind: "mongo" | "sql" = "sql";
}

const POST_PODS = "/api/v1/namespaces/auth-server/pods";
const PODS = {
    items: [
        {
            metadata: { name: "auth-abc" },
            spec: {
                volumes: [{ persistentVolumeClaim: { claimName: "auth-data" } }],
                containers: [
                    { name: "auth", image: "ghcr.io/rapidrest/auth-server:1.0.0", resources: { requests: { cpu: "100m", memory: "100Mi" } } },
                    { name: "sidecar", image: "nginx:1", resources: { requests: { cpu: "50m" }, limits: { cpu: "500m" } } },
                ],
            },
            status: { phase: "Running" },
        },
        {
            metadata: { name: "mongodb-0" },
            spec: { containers: [{ name: "mongodb", image: "docker.io/bitnami/mongodb:8.0.4" }] },
            status: { phase: "Running" },
        },
        {
            metadata: { name: "job" },
            spec: { containers: [{ name: "job", image: "busybox" }] },
            status: { phase: "Succeeded" },
        },
    ],
};
const METRICS = {
    items: [
        {
            metadata: { name: "auth-abc" },
            containers: [
                { name: "auth", usage: { cpu: "20m", memory: "60Mi" } },
                { name: "sidecar", usage: { cpu: "5m", memory: "10Mi" } },
            ],
        },
        // mongodb-0 has a reading, but with no container we know of; "job" has none at all.
        { metadata: { name: "mongodb-0" }, containers: [{ name: "other", usage: {} }] },
    ],
};
const PVCS = { items: [{ metadata: { name: "auth-data" }, status: { phase: "Bound", capacity: { storage: "8Gi" } } }] };

function fakeKube(routes: Record<string, any>): KubeContext {
    return {
        namespace: "auth-server",
        podName: "auth-abc",
        request: vi.fn(async (path: string) => {
            if (!(path in routes)) throw new Error(`${path}: HTTP 403`);
            return routes[path];
        }),
    };
}

function makeRoute(kube: KubeContext | undefined, extra: Partial<Record<string, any>> = {}) {
    const route = new TestRoute();
    Object.assign(route, { createKube: vi.fn(async () => kube), ...extra });
    return route;
}

const sqlDatastore = {
    options: { type: "postgres" },
    query: async () => [{ version: "PostgreSQL 16.4 on x", size: "100" }],
};
const cacheClient = { info: async () => "redis_version:7.4.1\nused_memory:50\n" };

describe("BaseDiagnosticsRoute", () => {
    describe("versions()", () => {
        it("reports this server, its installed packages, the datastores and the namespace's pods", async () => {
            const kube = fakeKube({ [POST_PODS]: PODS });
            const route = makeRoute(kube, { primaryDatastore: sqlDatastore, cacheClient });

            const v = await route.versions();

            expect(v.server.name).toBe("auth-server");
            expect(v.server.version).toMatch(/^\d+\.\d+\.\d+/);
            expect(v.server.node).toEqual({
                version: process.version,
                v8: process.versions.v8,
                platform: process.platform,
                arch: process.arch,
            });
            // The real dependency tree: this repo's own test dependencies, for one, must be listed.
            expect(v.server.packages.find((p) => p.name === "vitest")).toBeDefined();
            expect(v.datastores).toEqual([
                { kind: "postgresql", role: "database", version: "16.4", usedBytes: 100 },
                { kind: "redis", role: "cache", version: "7.4.1", usedBytes: 50, totalBytes: undefined },
            ]);
            expect(v.pods!.map((p) => p.name)).toEqual(["auth-abc", "mongodb-0", "job"]);
            expect(v.pods![1].containers[0]).toMatchObject({ kind: "mongodb", tag: "8.0.4" });
            expect(v.podsError).toBeUndefined();
        });

        it("reads the package inventory only once", async () => {
            const route = makeRoute(undefined);
            const first = await route.versions();
            const second = await route.versions();
            expect(second.server.packages).toBe(first.server.packages);
        });

        it("uses the MongoDB probe for a mongo route, and skips datastores that aren't configured", async () => {
            const route = makeRoute(undefined, {
                primaryKind: "mongo",
                primaryDatastore: {
                    admin: () => ({ serverInfo: async () => ({ version: "8.0.4" }) }),
                    db: { command: async () => ({ fsUsedSize: 1, fsTotalSize: 2 }) },
                },
            });
            expect((await route.versions()).datastores).toEqual([
                { kind: "mongodb", role: "database", version: "8.0.4", usedBytes: 1, totalBytes: 2 },
            ]);
            expect((await makeRoute(undefined).versions()).datastores).toEqual([]);
        });

        it("has no pods outside Kubernetes", async () => {
            const v = await makeRoute(undefined).versions();
            expect(v.pods).toBeNull();
            expect(v.podsError).toBeUndefined();
        });

        it("reports why the pods couldn't be read, without failing the request", async () => {
            const v = await makeRoute(fakeKube({})).versions();
            expect(v.pods).toBeNull();
            expect(v.podsError).toBe(`${POST_PODS}: HTTP 403`);
        });
    });

    describe("runtime()", () => {
        it("says when the server isn't running in Kubernetes", async () => {
            expect(await makeRoute(undefined).runtime()).toEqual({ inCluster: false });
        });

        it("reports the cluster version", async () => {
            const route = makeRoute(fakeKube({ "/version": { gitVersion: "v1.30.2+k3s1" } }));
            expect(await route.runtime()).toMatchObject({
                inCluster: true,
                namespace: "auth-server",
                podName: "auth-abc",
                version: { gitVersion: "v1.30.2+k3s1", distribution: "k3s" },
            });
        });

        it("reports why the version couldn't be read", async () => {
            expect(await makeRoute(fakeKube({})).runtime()).toEqual({
                inCluster: true,
                namespace: "auth-server",
                podName: "auth-abc",
                error: "/version: HTTP 403",
            });
        });

        it("asks for the in-cluster context once", async () => {
            const route = makeRoute(undefined);
            await route.runtime();
            await route.versions();
            await route.system();
            expect((route as any).createKube).toHaveBeenCalledTimes(1);
        });
    });

    describe("system()", () => {
        const metricsPath = "/apis/metrics.k8s.io/v1beta1/namespaces/auth-server/pods";
        const pvcPath = "/api/v1/namespaces/auth-server/persistentvolumeclaims";

        it("reports this server, the datastores, and the namespace's pods with live use and claims", async () => {
            const route = makeRoute(fakeKube({ [POST_PODS]: PODS, [metricsPath]: METRICS, [pvcPath]: PVCS }), {
                primaryDatastore: sqlDatastore,
                cacheClient,
            });

            const s = await route.system();

            expect(new Date(s.timestamp).getTime()).not.toBeNaN();
            expect(s.server.memory.rssBytes).toBeGreaterThan(0);
            expect(s.datastores.map((d) => d.kind)).toEqual(["postgresql", "redis"]);
            expect(s.kubernetes).toMatchObject({ namespace: "auth-server", metricsAvailable: true });
            expect(s.kubernetes!.error).toBeUndefined();
            expect(s.kubernetes!.pvcs).toEqual([
                expect.objectContaining({ name: "auth-data", capacityBytes: 8 * 1024 ** 3, mountedBy: ["auth-abc"] }),
            ]);
            expect(s.kubernetes!.pods).toEqual([
                {
                    name: "auth-abc",
                    self: true,
                    phase: "Running",
                    kind: "server",
                    // Summed over both containers.
                    cpuCores: expect.closeTo(0.025, 6),
                    memoryBytes: 70 * 1024 ** 2,
                    cpuRequestCores: expect.closeTo(0.15, 6),
                    cpuLimitCores: 0.5,
                    memoryRequestBytes: 100 * 1024 ** 2,
                    memoryLimitBytes: undefined,
                },
                {
                    name: "mongodb-0",
                    self: false,
                    phase: "Running",
                    kind: "mongodb",
                    cpuCores: undefined,
                    memoryBytes: undefined,
                    cpuRequestCores: undefined,
                    cpuLimitCores: undefined,
                    memoryRequestBytes: undefined,
                    memoryLimitBytes: undefined,
                },
                expect.objectContaining({ name: "job", kind: "other", cpuCores: undefined }),
            ]);
        });

        it("reports pods without live use when metrics-server isn't available", async () => {
            const s = await makeRoute(fakeKube({ [POST_PODS]: PODS, [pvcPath]: PVCS })).system();
            expect(s.kubernetes!.metricsAvailable).toBe(false);
            expect(s.kubernetes!.pods).toHaveLength(3);
            expect(s.kubernetes!.pods[0]).toMatchObject({ cpuCores: undefined, cpuRequestCores: expect.closeTo(0.15, 6) });
        });

        it("is null outside Kubernetes", async () => {
            expect((await makeRoute(undefined).system()).kubernetes).toBeNull();
        });

        it("reports why Kubernetes couldn't be read, without failing the request", async () => {
            const s = await makeRoute(fakeKube({ [POST_PODS]: PODS, [metricsPath]: METRICS })).system();
            expect(s.kubernetes).toEqual({
                namespace: "auth-server",
                metricsAvailable: false,
                pods: [],
                pvcs: [],
                error: `${pvcPath}: HTTP 403`,
            });
            expect(s.server.cpu.cores).toBeGreaterThan(0);
        });
    });

    describe("in-cluster context", () => {
        it("uses the real in-cluster lookup by default (none outside a cluster)", async () => {
            const saved = process.env.KUBERNETES_SERVICE_HOST;
            delete process.env.KUBERNETES_SERVICE_HOST;
            try {
                expect(await new TestRoute().runtime()).toEqual({ inCluster: false });
            } finally {
                if (saved !== undefined) process.env.KUBERNETES_SERVICE_HOST = saved;
            }
        });
    });

    describe("subclasses", () => {
        it("are mounted at /diagnostics against the right primary datastore", () => {
            expect(new MongoDiagnosticsRoute()).toMatchObject({ primaryKind: "mongo" });
            expect(new SqlDiagnosticsRoute()).toMatchObject({ primaryKind: "sql" });
        });
    });
});
