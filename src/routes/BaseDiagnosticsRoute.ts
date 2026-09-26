///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectDecorators } from "@rapidrest/core";
import { DatabaseDecorators, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { probeMongo, probeRedis, probeSql, type DatastoreInfo } from "../diagnostics/DatastoreInfo.js";
import {
    createKubeContext,
    getKubernetesVersion,
    getPodUsage,
    listPods,
    listPvcs,
    type ContainerKind,
    type KubeContext,
    type KubernetesVersion,
    type PodSummary,
    type PvcSummary,
} from "../diagnostics/KubernetesInfo.js";
import { readPackageInventory, type PackageInventory } from "../diagnostics/PackageInventory.js";
import { SystemSampler, type ServerMetrics } from "../diagnostics/SystemMetrics.js";

const { Logger } = ObjectDecorators;
const { Redis } = DatabaseDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, RequiresElevation, RequiresTrustedRole } = RouteDecorators;

const _dirname = dirname(fileURLToPath(import.meta.url));

export interface VersionsResponse {
    server: {
        name: string;
        version: string;
        node: { version: string; v8: string; platform: string; arch: string };
        packages: PackageInventory["packages"];
    };
    datastores: DatastoreInfo[];
    /** Every pod in the namespace with its containers' images; `null` outside Kubernetes. */
    pods: PodSummary[] | null;
    podsError?: string;
}

export interface RuntimeResponse {
    inCluster: boolean;
    namespace?: string;
    podName?: string;
    version?: KubernetesVersion;
    error?: string;
}

export interface PodUsageSummary {
    name: string;
    self: boolean;
    phase: string;
    kind: ContainerKind;
    /** Live use summed over the pod's containers; absent when metrics-server has no reading for it. */
    cpuCores?: number;
    memoryBytes?: number;
    cpuRequestCores?: number;
    cpuLimitCores?: number;
    memoryRequestBytes?: number;
    memoryLimitBytes?: number;
}

export interface SystemResponse {
    timestamp: string;
    server: ServerMetrics;
    datastores: DatastoreInfo[];
    /** `null` outside Kubernetes. */
    kubernetes: {
        namespace: string;
        /** `false` when metrics-server isn't installed or the ServiceAccount can't read it. */
        metricsAvailable: boolean;
        pods: PodUsageSummary[];
        pvcs: PvcSummary[];
        error?: string;
    } | null;
}

/** Sums an optional numeric field over `items`, staying `undefined` when none of them have it. */
function sumOf<T>(items: T[], pick: (item: T) => number | undefined): number | undefined {
    const values = items.map(pick).filter((value): value is number => value !== undefined);
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0);
}

/**
 * Admin-console diagnostics for troubleshooting a deployment: what's running (versions of this server, its
 * packages, Node, Kubernetes and the MongoDB/PostgreSQL/Redis pods), and live resource use (this server's own
 * CPU/memory/disk, the namespace's pods, its volume claims and what each datastore reports about its own storage).
 * The service log has its own live stream, `/api/admin/logs`, which the console connects to directly.
 *
 * Every endpoint requires a fresh elevation and the `admin` trusted role, like `BaseAdminRoute`, since the output
 * (installed packages, infrastructure layout) is a map for anyone attacking the deployment.
 *
 * The Kubernetes half talks to the API with the pod's own ServiceAccount, read-only and only within its own
 * namespace (the Helm chart's `diagnostics-rbac.yaml`). Outside a cluster (Docker Compose, a laptop) it is simply
 * absent, and a section the account isn't permitted to read reports its error rather than failing the request.
 * Subclasses inject the primary database as `primaryDatastore`.
 *
 * @author Jean-Philippe Steinmetz
 */
@Summary("Diagnostics for troubleshooting the deployment")
@RequiresElevation()
export abstract class BaseDiagnosticsRoute {
    /** The primary database connection (a `MongoConnection` or a TypeORM `DataSource`), injected by the subclass. */
    protected abstract primaryDatastore?: any;

    protected abstract primaryKind: "mongo" | "sql";

    @Redis("cache", false)
    protected cacheClient?: any;

    @Logger
    protected logger?: any;

    /** Overridable so tests needn't run inside a cluster. */
    protected createKube: () => Promise<KubeContext | undefined> = () => createKubeContext();

    protected sampler = new SystemSampler();

    private inventory?: Promise<PackageInventory>;

    private kube?: Promise<KubeContext | undefined>;

    /** The in-cluster context, resolved once. */
    private getKube(): Promise<KubeContext | undefined> {
        return (this.kube ??= this.createKube());
    }

    /** The installed packages never change while the process runs, so they're read once. */
    private getInventory(): Promise<PackageInventory> {
        return (this.inventory ??= readPackageInventory(_dirname));
    }

    private async probeDatastores(): Promise<DatastoreInfo[]> {
        const probes: Promise<DatastoreInfo>[] = [];
        if (this.primaryDatastore) {
            probes.push(this.primaryKind === "mongo" ? probeMongo(this.primaryDatastore) : probeSql(this.primaryDatastore));
        }
        if (this.cacheClient) {
            probes.push(probeRedis(this.cacheClient));
        }
        return Promise.all(probes);
    }

    @Summary("Get version information")
    @Description(
        "Trusted-role-only. The Node.js runtime, the deployed package and every installed package, the version each " +
            "datastore reports, and the images of every pod in the Kubernetes namespace.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get("/versions")
    @RequiresTrustedRole()
    public async versions(): Promise<VersionsResponse> {
        const [inventory, datastores, kube] = await Promise.all([
            this.getInventory(),
            this.probeDatastores(),
            this.getKube(),
        ]);
        let pods: PodSummary[] | null = null;
        let podsError: string | undefined;
        if (kube) {
            try {
                pods = await listPods(kube);
            } catch (err: any) {
                podsError = err.message;
            }
        }
        return {
            server: {
                name: inventory.name,
                version: inventory.version,
                node: {
                    version: process.version,
                    v8: process.versions.v8,
                    platform: process.platform,
                    arch: process.arch,
                },
                packages: inventory.packages,
            },
            datastores,
            pods,
            podsError,
        };
    }

    @Summary("Get Kubernetes runtime information")
    @Description("Trusted-role-only. The cluster's Kubernetes version, or that the server isn't running in one.")
    @Returns([Object])
    @Auth(["jwt"])
    @Get("/runtime")
    @RequiresTrustedRole()
    public async runtime(): Promise<RuntimeResponse> {
        const kube = await this.getKube();
        if (!kube) {
            return { inCluster: false };
        }
        const base = { inCluster: true, namespace: kube.namespace, podName: kube.podName };
        try {
            return { ...base, version: await getKubernetesVersion(kube) };
        } catch (err: any) {
            return { ...base, error: err.message };
        }
    }

    @Summary("Get a snapshot of live resource usage")
    @Description(
        "Trusted-role-only. This server's CPU, memory and disk use, the namespace's pods (with live use when " +
            "metrics-server is available) and volume claims, and each datastore's own storage figures. Meant to be " +
            "polled: the CPU figure is measured since the previous call.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get("/system")
    @RequiresTrustedRole()
    public async system(): Promise<SystemResponse> {
        const [server, datastores, kube] = await Promise.all([
            this.sampler.sample(),
            this.probeDatastores(),
            this.getKube(),
        ]);
        let kubernetes: SystemResponse["kubernetes"] = null;
        if (kube) {
            kubernetes = { namespace: kube.namespace, metricsAvailable: false, pods: [], pvcs: [] };
            try {
                const pods = await listPods(kube);
                const [usage, pvcs] = await Promise.all([getPodUsage(kube), listPvcs(kube, pods)]);
                kubernetes.metricsAvailable = usage !== undefined;
                kubernetes.pvcs = pvcs;
                kubernetes.pods = pods.map((pod): PodUsageSummary => {
                    const live = usage?.pods.get(pod.name);
                    const liveContainers = pod.containers.map((container) => live?.get(container.name));
                    return {
                        name: pod.name,
                        self: pod.self,
                        phase: pod.phase,
                        kind: pod.containers.find((container) => container.kind !== "other")?.kind ?? "other",
                        cpuCores: live ? sumOf(liveContainers, (c) => c?.cpuCores) : undefined,
                        memoryBytes: live ? sumOf(liveContainers, (c) => c?.memoryBytes) : undefined,
                        cpuRequestCores: sumOf(pod.containers, (c) => c.requests.cpuCores),
                        cpuLimitCores: sumOf(pod.containers, (c) => c.limits.cpuCores),
                        memoryRequestBytes: sumOf(pod.containers, (c) => c.requests.memoryBytes),
                        memoryLimitBytes: sumOf(pod.containers, (c) => c.limits.memoryBytes),
                    };
                });
            } catch (err: any) {
                kubernetes.error = err.message;
            }
        }
        return { timestamp: new Date().toISOString(), server, datastores, kubernetes };
    }
}
