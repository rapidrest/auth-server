///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { readFile } from "node:fs/promises";
import https from "node:https";

const SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";
const REQUEST_TIMEOUT_MS = 5000;

/** Fetches a Kubernetes API path (e.g. `/version`) and resolves to its parsed JSON body. Rejects on any failure. */
export type KubeRequester = (path: string) => Promise<any>;

/** Everything the in-cluster requester touches outside its own code, so it can be substituted in tests. */
export interface InClusterDeps {
    env: Record<string, string | undefined>;
    readFile: (path: string) => Promise<Buffer>;
    request: typeof https.request;
}

export interface KubeContext {
    request: KubeRequester;
    namespace: string;
    /** The pod this server is running in (the container's hostname). */
    podName?: string;
}

/**
 * Builds a requester for the Kubernetes API using the pod's own ServiceAccount, or `undefined` when the server isn't
 * running inside a cluster (no `KUBERNETES_SERVICE_HOST`, or no mounted ServiceAccount).
 */
export async function createKubeContext(
    deps: InClusterDeps = { env: process.env, readFile, request: https.request },
): Promise<KubeContext | undefined> {
    const { env } = deps;
    const host = env.KUBERNETES_SERVICE_HOST;
    if (!host) {
        return undefined;
    }
    let ca: Buffer;
    let namespace: string;
    try {
        ca = await deps.readFile(`${SERVICE_ACCOUNT_DIR}/ca.crt`);
        namespace = (await deps.readFile(`${SERVICE_ACCOUNT_DIR}/namespace`)).toString("utf-8").trim();
    } catch {
        return undefined;
    }
    const port = Number(env.KUBERNETES_SERVICE_PORT) || 443;

    const request: KubeRequester = async (path) => {
        // Re-read per request: the projected token is rotated by the kubelet.
        const token = (await deps.readFile(`${SERVICE_ACCOUNT_DIR}/token`)).toString("utf-8").trim();
        return new Promise((resolve, reject) => {
            const req = deps.request(
                {
                    host,
                    port,
                    path,
                    method: "GET",
                    ca,
                    timeout: REQUEST_TIMEOUT_MS,
                    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => chunks.push(chunk));
                    res.on("end", () => {
                        const body = Buffer.concat(chunks).toString("utf-8");
                        if ((res.statusCode ?? 500) >= 400) {
                            reject(new Error(`${path}: HTTP ${res.statusCode}`));
                            return;
                        }
                        try {
                            resolve(JSON.parse(body));
                        } catch {
                            reject(new Error(`${path}: invalid JSON response`));
                        }
                    });
                },
            );
            req.on("timeout", () => req.destroy(new Error(`${path}: timed out`)));
            req.on("error", reject);
            req.end();
        });
    };

    return { request, namespace, podName: env.HOSTNAME };
}

/**
 * Parses a Kubernetes resource quantity (`250m`, `128Mi`, `1.5`, `12345678n`, `2G`, …) into a plain number: cores
 * for CPU, bytes for memory/storage. `undefined` for anything unparseable.
 */
export function parseQuantity(quantity: unknown): number | undefined {
    if (typeof quantity !== "string") {
        return undefined;
    }
    const match = /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([a-zA-Z]*)$/.exec(quantity.trim());
    if (!match) {
        return undefined;
    }
    const multipliers: Record<string, number> = {
        "": 1,
        n: 1e-9,
        u: 1e-6,
        m: 1e-3,
        k: 1e3,
        M: 1e6,
        G: 1e9,
        T: 1e12,
        P: 1e15,
        E: 1e18,
        Ki: 1024,
        Mi: 1024 ** 2,
        Gi: 1024 ** 3,
        Ti: 1024 ** 4,
        Pi: 1024 ** 5,
        Ei: 1024 ** 6,
    };
    const multiplier = multipliers[match[2]];
    return multiplier === undefined ? undefined : Number(match[1]) * multiplier;
}

export type ContainerKind = "server" | "mongodb" | "postgresql" | "redis" | "other";

/** Which well-known component an image belongs to, from its repository name. */
export function classifyImage(image: string, serverImageHint?: string): ContainerKind {
    const repository = image.replace(/[:@].*$/, "").toLowerCase();
    if (/(^|[/-])mongo(db)?$/.test(repository)) return "mongodb";
    if (/(^|[/-])(postgres|postgresql|postgresql-repmgr)$/.test(repository)) return "postgresql";
    if (/(^|[/-])(redis|valkey)$/.test(repository)) return "redis";
    if (serverImageHint && repository === serverImageHint.replace(/[:@].*$/, "").toLowerCase()) return "server";
    return "other";
}

/** The tag (or digest) part of an image reference; `latest` when it has neither. */
export function imageTag(image: string): string {
    const digest = image.indexOf("@");
    if (digest !== -1) {
        return image.slice(digest + 1);
    }
    const colon = image.lastIndexOf(":");
    return colon > image.lastIndexOf("/") ? image.slice(colon + 1) : "latest";
}

export interface ContainerSummary {
    name: string;
    image: string;
    tag: string;
    kind: ContainerKind;
    ready: boolean;
    restarts: number;
    requests: { cpuCores?: number; memoryBytes?: number };
    limits: { cpuCores?: number; memoryBytes?: number };
}

export interface PodSummary {
    name: string;
    phase: string;
    node?: string;
    startTime?: string;
    /** `true` for the pod this server is running in. */
    self: boolean;
    containers: ContainerSummary[];
    /** Names of the PersistentVolumeClaims the pod mounts. */
    claims: string[];
}

/** Lists the namespace's pods in the shape the diagnostics page shows. */
export async function listPods(kube: KubeContext): Promise<PodSummary[]> {
    const list = await kube.request(`/api/v1/namespaces/${encodeURIComponent(kube.namespace)}/pods`);
    const self = (list.items ?? []).find((pod: any) => pod.metadata?.name === kube.podName);
    const serverImage: string | undefined = self?.spec?.containers?.[0]?.image;
    return (list.items ?? []).map((pod: any): PodSummary => {
        const statuses: any[] = pod.status?.containerStatuses ?? [];
        return {
            name: pod.metadata?.name ?? "",
            phase: pod.status?.phase ?? "Unknown",
            node: pod.spec?.nodeName,
            startTime: pod.status?.startTime,
            self: pod.metadata?.name === kube.podName,
            claims: (pod.spec?.volumes ?? [])
                .map((volume: any) => volume.persistentVolumeClaim?.claimName)
                .filter((claim: unknown): claim is string => typeof claim === "string"),
            containers: (pod.spec?.containers ?? []).map((container: any): ContainerSummary => {
                const status = statuses.find((s) => s.name === container.name);
                return {
                    name: container.name,
                    image: container.image ?? "",
                    tag: imageTag(container.image ?? ""),
                    kind: classifyImage(container.image ?? "", serverImage),
                    ready: status?.ready ?? false,
                    restarts: status?.restartCount ?? 0,
                    requests: {
                        cpuCores: parseQuantity(container.resources?.requests?.cpu),
                        memoryBytes: parseQuantity(container.resources?.requests?.memory),
                    },
                    limits: {
                        cpuCores: parseQuantity(container.resources?.limits?.cpu),
                        memoryBytes: parseQuantity(container.resources?.limits?.memory),
                    },
                };
            }),
        };
    });
}

export interface KubernetesVersion {
    gitVersion: string;
    major?: string;
    minor?: string;
    platform?: string;
    goVersion?: string;
    buildDate?: string;
    /** Best-effort guess from the version string's vendor suffix (`+k3s1`, `-eks-…`, `-gke.…`). */
    distribution?: string;
}

/** The cluster's version (`/version` is readable by every authenticated client, so this needs no RBAC of its own). */
export async function getKubernetesVersion(kube: KubeContext): Promise<KubernetesVersion> {
    const v = await kube.request("/version");
    const gitVersion: string = v.gitVersion ?? "unknown";
    let distribution: string | undefined;
    if (/\+k3s/.test(gitVersion)) distribution = "k3s";
    else if (/-eks-/.test(gitVersion)) distribution = "EKS";
    else if (/-gke\./.test(gitVersion)) distribution = "GKE";
    return {
        gitVersion,
        major: v.major,
        minor: v.minor,
        platform: v.platform,
        goVersion: v.goVersion,
        buildDate: v.buildDate,
        distribution,
    };
}

export interface PodUsage {
    /** pod name → container name → live usage. */
    pods: Map<string, Map<string, { cpuCores?: number; memoryBytes?: number }>>;
}

/**
 * Live per-container CPU/memory from `metrics.k8s.io` (metrics-server, which k3s ships). Resolves to `undefined`
 * when the metrics API isn't available or the ServiceAccount may not read it.
 */
export async function getPodUsage(kube: KubeContext): Promise<PodUsage | undefined> {
    let list;
    try {
        list = await kube.request(`/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(kube.namespace)}/pods`);
    } catch {
        return undefined;
    }
    const pods: PodUsage["pods"] = new Map();
    for (const item of list.items ?? []) {
        const containers = new Map<string, { cpuCores?: number; memoryBytes?: number }>();
        for (const container of item.containers ?? []) {
            containers.set(container.name, {
                cpuCores: parseQuantity(container.usage?.cpu),
                memoryBytes: parseQuantity(container.usage?.memory),
            });
        }
        pods.set(item.metadata?.name, containers);
    }
    return { pods };
}

export interface PvcSummary {
    name: string;
    phase: string;
    storageClass?: string;
    volumeName?: string;
    accessModes: string[];
    /** The provisioned size; Kubernetes reports nothing about how much of it is used. */
    capacityBytes?: number;
    /** The pods that currently mount the claim. */
    mountedBy: string[];
}

/** Lists the namespace's PersistentVolumeClaims, each with the pods that mount it. */
export async function listPvcs(kube: KubeContext, pods: PodSummary[]): Promise<PvcSummary[]> {
    const list = await kube.request(`/api/v1/namespaces/${encodeURIComponent(kube.namespace)}/persistentvolumeclaims`);
    return (list.items ?? []).map((pvc: any): PvcSummary => {
        const name: string = pvc.metadata?.name ?? "";
        return {
            name,
            phase: pvc.status?.phase ?? "Unknown",
            storageClass: pvc.spec?.storageClassName,
            volumeName: pvc.spec?.volumeName,
            accessModes: pvc.status?.accessModes ?? pvc.spec?.accessModes ?? [],
            capacityBytes: parseQuantity(pvc.status?.capacity?.storage ?? pvc.spec?.resources?.requests?.storage),
            mountedBy: pods.filter((pod) => pod.claims.includes(name)).map((pod) => pod.name),
        };
    });
}
