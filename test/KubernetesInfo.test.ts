///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import {
    classifyImage,
    createKubeContext,
    getKubernetesVersion,
    getPodUsage,
    imageTag,
    listPods,
    listPvcs,
    parseQuantity,
    type InClusterDeps,
    type KubeContext,
} from "../src/diagnostics/KubernetesInfo.js";

const SA = "/var/run/secrets/kubernetes.io/serviceaccount";

/** A fake `https.request` that answers with `status`/`body`, or emits `failure`/a timeout, recording each call. */
function fakeHttps(opts: { status?: number; body?: string; failure?: Error; timeout?: boolean }) {
    const calls: any[] = [];
    const request = ((options: any, callback: (res: any) => void) => {
        calls.push(options);
        const req: any = new EventEmitter();
        req.destroy = vi.fn((err?: Error) => req.emit("error", err));
        req.end = () => {
            if (opts.failure) {
                req.emit("error", opts.failure);
            } else if (opts.timeout) {
                req.emit("timeout");
            } else {
                const res: any = new EventEmitter();
                res.statusCode = opts.status ?? 200;
                callback(res);
                // The body arrives in two chunks.
                const body = opts.body ?? "{}";
                res.emit("data", Buffer.from(body.slice(0, 3)));
                res.emit("data", Buffer.from(body.slice(3)));
                res.emit("end");
            }
        };
        return req;
    }) as any;
    return { request, calls };
}

function makeDeps(overrides: Partial<InClusterDeps> = {}): InClusterDeps {
    return {
        env: { KUBERNETES_SERVICE_HOST: "10.0.0.1", KUBERNETES_SERVICE_PORT: "6443", HOSTNAME: "auth-abc" },
        readFile: async (path: string) => {
            if (path === `${SA}/ca.crt`) return Buffer.from("CA");
            if (path === `${SA}/namespace`) return Buffer.from("auth-server\n");
            if (path === `${SA}/token`) return Buffer.from("TOKEN\n");
            throw new Error("ENOENT");
        },
        request: fakeHttps({ body: '{"ok":true}' }).request,
        ...overrides,
    };
}

describe("createKubeContext", () => {
    it("is undefined outside a cluster", async () => {
        expect(await createKubeContext(makeDeps({ env: {} }))).toBeUndefined();
    });

    it("is undefined when the ServiceAccount isn't mounted", async () => {
        const readFile = async () => {
            throw new Error("ENOENT");
        };
        expect(await createKubeContext(makeDeps({ readFile }))).toBeUndefined();
    });

    it("authenticates with the pod's token and CA, and knows its namespace and pod name", async () => {
        const https = fakeHttps({ body: '{"gitVersion":"v1.30.2+k3s1"}' });
        const kube = (await createKubeContext(makeDeps({ request: https.request })))!;
        expect(kube.namespace).toBe("auth-server");
        expect(kube.podName).toBe("auth-abc");
        expect(await kube.request("/version")).toEqual({ gitVersion: "v1.30.2+k3s1" });
        expect(https.calls[0]).toMatchObject({
            host: "10.0.0.1",
            port: 6443,
            path: "/version",
            method: "GET",
            headers: { Authorization: "Bearer TOKEN" },
        });
        expect(https.calls[0].ca.toString()).toBe("CA");
    });

    it("defaults to port 443", async () => {
        const https = fakeHttps({});
        const env = { KUBERNETES_SERVICE_HOST: "kubernetes.default.svc" };
        const kube = (await createKubeContext(makeDeps({ env, request: https.request })))!;
        await kube.request("/version");
        expect(https.calls[0].port).toBe(443);
        expect(kube.podName).toBeUndefined();
    });

    it("rejects on an HTTP error status, unparseable JSON, a network failure and a timeout", async () => {
        const kubeFor = async (opts: Parameters<typeof fakeHttps>[0]) =>
            (await createKubeContext(makeDeps({ request: fakeHttps(opts).request })))!;
        await expect((await kubeFor({ status: 403 })).request("/api/v1/pods")).rejects.toThrow("/api/v1/pods: HTTP 403");
        await expect((await kubeFor({ body: "<html>" })).request("/x")).rejects.toThrow("/x: invalid JSON response");
        await expect((await kubeFor({ failure: new Error("ECONNREFUSED") })).request("/x")).rejects.toThrow(
            "ECONNREFUSED",
        );
        await expect((await kubeFor({ timeout: true })).request("/x")).rejects.toThrow("/x: timed out");
    });

    it("treats a response with no status code as a server error", async () => {
        const request = ((options: any, callback: (res: any) => void) => {
            const req: any = new EventEmitter();
            req.end = () => {
                const res: any = new EventEmitter();
                callback(res);
                res.emit("end");
            };
            return req;
        }) as any;
        const kube = (await createKubeContext(makeDeps({ request })))!;
        await expect(kube.request("/x")).rejects.toThrow("/x: HTTP undefined");
    });

    it("builds a context from the real environment defaults", async () => {
        // No cluster here (and none configured in CI), so this is the "not in a cluster" answer.
        const saved = process.env.KUBERNETES_SERVICE_HOST;
        delete process.env.KUBERNETES_SERVICE_HOST;
        try {
            expect(await createKubeContext()).toBeUndefined();
        } finally {
            if (saved !== undefined) process.env.KUBERNETES_SERVICE_HOST = saved;
        }
    });
});

describe("parseQuantity", () => {
    it.each([
        ["250m", 0.25],
        ["1", 1],
        ["1.5", 1.5],
        ["12345678n", 0.012345678],
        ["500u", 0.0005],
        ["128Mi", 128 * 1024 ** 2],
        ["1Gi", 1024 ** 3],
        ["10Ki", 10240],
        ["2G", 2e9],
        ["3k", 3000],
        ["5M", 5e6],
        ["1T", 1e12],
        ["1Ti", 1024 ** 4],
        ["1e3", 1000],
        [" 2 ", 2],
    ])("parses %s", (input, expected) => {
        expect(parseQuantity(input)).toBeCloseTo(expected, 9);
    });

    it("rejects anything that isn't a quantity", () => {
        expect(parseQuantity(undefined)).toBeUndefined();
        expect(parseQuantity(5)).toBeUndefined();
        expect(parseQuantity("lots")).toBeUndefined();
        expect(parseQuantity("5Zi")).toBeUndefined();
    });
});

describe("image helpers", () => {
    it("classifies the datastore images by repository, whatever the registry or tag", () => {
        expect(classifyImage("docker.io/bitnami/mongodb:8.0.4")).toBe("mongodb");
        expect(classifyImage("mongo:7")).toBe("mongodb");
        expect(classifyImage("registry.example.com/bitnamilegacy/postgresql:16.4.0-debian")).toBe("postgresql");
        expect(classifyImage("postgres@sha256:abc")).toBe("postgresql");
        expect(classifyImage("docker.io/bitnami/redis:7.4")).toBe("redis");
        expect(classifyImage("valkey/valkey:8")).toBe("redis");
        expect(classifyImage("rapidrest/mongodb-exporter:1")).toBe("other");
        expect(classifyImage("nginx:1")).toBe("other");
    });

    it("recognizes the server's own image when given it", () => {
        expect(classifyImage("ghcr.io/rapidrest/auth-server:1.0.0", "ghcr.io/rapidrest/auth-server:1.0.0")).toBe("server");
        expect(classifyImage("ghcr.io/rapidrest/auth-server:1.0.0")).toBe("other");
        expect(classifyImage("ghcr.io/rapidrest/other:1.0.0", "ghcr.io/rapidrest/auth-server:1.0.0")).toBe("other");
    });

    it("extracts the tag, a digest, or defaults to latest", () => {
        expect(imageTag("docker.io/bitnami/redis:7.4")).toBe("7.4");
        expect(imageTag("postgres@sha256:abc")).toBe("sha256:abc");
        expect(imageTag("localhost:5000/redis")).toBe("latest");
        expect(imageTag("redis")).toBe("latest");
    });
});

const POD_LIST = {
    items: [
        {
            metadata: { name: "auth-abc" },
            spec: {
                nodeName: "node-1",
                volumes: [{ name: "data", persistentVolumeClaim: { claimName: "auth-data" } }, { name: "tmp", emptyDir: {} }],
                containers: [
                    {
                        name: "auth",
                        image: "ghcr.io/rapidrest/auth-server:1.0.0",
                        resources: { requests: { cpu: "100m", memory: "384Mi" } },
                    },
                    { name: "sidecar", image: "nginx:1", resources: { limits: { cpu: "1", memory: "1Gi" } } },
                ],
            },
            status: {
                phase: "Running",
                startTime: "2026-09-26T00:00:00Z",
                containerStatuses: [{ name: "auth", ready: true, restartCount: 2 }],
            },
        },
        {
            metadata: { name: "mongodb-0" },
            spec: {
                volumes: [{ persistentVolumeClaim: { claimName: "datadir-mongodb-0" } }],
                containers: [{ name: "mongodb", image: "docker.io/bitnami/mongodb:8.0.4" }],
            },
            status: {},
        },
        // A pod the API returned with almost nothing filled in.
        { spec: {} },
    ],
};

function fakeKube(routes: Record<string, any>, podName = "auth-abc"): KubeContext {
    return {
        namespace: "auth-server",
        podName,
        request: vi.fn(async (path: string) => {
            if (!(path in routes)) throw new Error(`${path}: HTTP 403`);
            return routes[path];
        }),
    };
}

describe("listPods", () => {
    it("summarizes the namespace's pods, their containers and the claims they mount", async () => {
        const kube = fakeKube({ "/api/v1/namespaces/auth-server/pods": POD_LIST });
        const pods = await listPods(kube);
        expect(pods).toHaveLength(3);
        expect(pods[0]).toEqual({
            name: "auth-abc",
            phase: "Running",
            node: "node-1",
            startTime: "2026-09-26T00:00:00Z",
            self: true,
            claims: ["auth-data"],
            containers: [
                {
                    name: "auth",
                    image: "ghcr.io/rapidrest/auth-server:1.0.0",
                    tag: "1.0.0",
                    kind: "server",
                    ready: true,
                    restarts: 2,
                    requests: { cpuCores: 0.1, memoryBytes: 384 * 1024 ** 2 },
                    limits: { cpuCores: undefined, memoryBytes: undefined },
                },
                {
                    name: "sidecar",
                    image: "nginx:1",
                    tag: "1",
                    kind: "other",
                    ready: false,
                    restarts: 0,
                    requests: { cpuCores: undefined, memoryBytes: undefined },
                    limits: { cpuCores: 1, memoryBytes: 1024 ** 3 },
                },
            ],
        });
        expect(pods[1]).toMatchObject({ name: "mongodb-0", phase: "Unknown", self: false });
        expect(pods[1].containers[0].kind).toBe("mongodb");
        expect(pods[2]).toMatchObject({ name: "", containers: [], claims: [], self: false });
    });

    it("copes with a list that has no items, and with this pod not being in it", async () => {
        expect(await listPods(fakeKube({ "/api/v1/namespaces/auth-server/pods": {} }))).toEqual([]);
        const pods = await listPods(fakeKube({ "/api/v1/namespaces/auth-server/pods": POD_LIST }, "elsewhere"));
        expect(pods[0].containers[0].kind).toBe("other");
    });

    it("copes with a container that has no image", async () => {
        const list = { items: [{ metadata: { name: "p" }, spec: { containers: [{ name: "c" }] } }] };
        const [pod] = await listPods(fakeKube({ "/api/v1/namespaces/auth-server/pods": list }));
        expect(pod.containers[0]).toMatchObject({ image: "", tag: "latest", kind: "other" });
    });
});

describe("getKubernetesVersion", () => {
    it("reports the version and guesses the distribution from its suffix", async () => {
        const version = async (gitVersion?: string) =>
            getKubernetesVersion(
                fakeKube({
                    "/version": { gitVersion, major: "1", minor: "30", platform: "linux/amd64", goVersion: "go1.22", buildDate: "d" },
                }),
            );
        expect(await version("v1.30.2+k3s1")).toEqual({
            gitVersion: "v1.30.2+k3s1",
            major: "1",
            minor: "30",
            platform: "linux/amd64",
            goVersion: "go1.22",
            buildDate: "d",
            distribution: "k3s",
        });
        expect((await version("v1.30.2-eks-abc")).distribution).toBe("EKS");
        expect((await version("v1.30.2-gke.100")).distribution).toBe("GKE");
        expect((await version("v1.30.2")).distribution).toBeUndefined();
        expect((await version(undefined)).gitVersion).toBe("unknown");
    });
});

describe("getPodUsage", () => {
    const path = "/apis/metrics.k8s.io/v1beta1/namespaces/auth-server/pods";

    it("reads each container's live use", async () => {
        const usage = await getPodUsage(
            fakeKube({
                [path]: {
                    items: [
                        { metadata: { name: "auth-abc" }, containers: [{ name: "auth", usage: { cpu: "12345678n", memory: "100Mi" } }] },
                        { metadata: { name: "empty" } },
                    ],
                },
            }),
        );
        expect(usage!.pods.get("auth-abc")!.get("auth")).toEqual({ cpuCores: 0.012345678, memoryBytes: 100 * 1024 ** 2 });
        expect(usage!.pods.get("empty")!.size).toBe(0);
    });

    it("has no usage for a list without items", async () => {
        expect((await getPodUsage(fakeKube({ [path]: {} })))!.pods.size).toBe(0);
    });

    it("is undefined when the metrics API isn't available", async () => {
        expect(await getPodUsage(fakeKube({}))).toBeUndefined();
    });
});

describe("listPvcs", () => {
    const path = "/api/v1/namespaces/auth-server/persistentvolumeclaims";

    it("lists the claims with their capacity and the pods that mount them", async () => {
        const pods = await listPods(fakeKube({ "/api/v1/namespaces/auth-server/pods": POD_LIST }));
        const pvcs = await listPvcs(
            fakeKube({
                [path]: {
                    items: [
                        {
                            metadata: { name: "auth-data" },
                            spec: { storageClassName: "local-path", volumeName: "pv-1", accessModes: ["ReadWriteOnce"] },
                            status: { phase: "Bound", capacity: { storage: "8Gi" }, accessModes: ["ReadWriteOnce"] },
                        },
                        // Pending: not yet bound, so only what was requested is known.
                        { metadata: { name: "new" }, spec: { accessModes: ["ReadWriteMany"], resources: { requests: { storage: "1Gi" } } } },
                        {},
                    ],
                },
            }),
            pods,
        );
        expect(pvcs).toEqual([
            {
                name: "auth-data",
                phase: "Bound",
                storageClass: "local-path",
                volumeName: "pv-1",
                accessModes: ["ReadWriteOnce"],
                capacityBytes: 8 * 1024 ** 3,
                mountedBy: ["auth-abc"],
            },
            {
                name: "new",
                phase: "Unknown",
                storageClass: undefined,
                volumeName: undefined,
                accessModes: ["ReadWriteMany"],
                capacityBytes: 1024 ** 3,
                mountedBy: [],
            },
            {
                name: "",
                phase: "Unknown",
                storageClass: undefined,
                volumeName: undefined,
                accessModes: [],
                capacityBytes: undefined,
                mountedBy: [],
            },
        ]);
    });

    it("copes with a list that has no items", async () => {
        expect(await listPvcs(fakeKube({ [path]: {} }), [])).toEqual([]);
    });
});
