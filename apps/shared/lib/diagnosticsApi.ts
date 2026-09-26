///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The admin console's Diagnostics API (`BaseDiagnosticsRoute`, at `/api/diagnostics`). Every call needs a fresh
 * elevation and the `admin` trusted role, which `apiFetch()` prompts for like any other admin call.
 */
import { apiFetch } from "./api.js";

export interface DatastoreInfo {
    /** `mongodb`, `postgresql`, `sqlite`, `redis`, … */
    kind: string;
    /** What the server uses it for (`database`, `cache`). */
    role: string;
    /** The version the server itself reports over its connection. */
    version?: string;
    /** Data held, as the datastore reports it: the volume's use for MongoDB, database size for SQL, memory for Redis. */
    usedBytes?: number;
    /** The capacity `usedBytes` is measured against, when the datastore reports one. */
    totalBytes?: number;
    /** Why the datastore couldn't be queried. */
    error?: string;
}

export type ContainerKind = "server" | "mongodb" | "postgresql" | "redis" | "other";

export interface ContainerSummary {
    name: string;
    image: string;
    tag: string;
    kind: ContainerKind;
    ready: boolean;
    restarts: number;
}

export interface PodSummary {
    name: string;
    phase: string;
    /** `true` for the pod this server is running in. */
    self: boolean;
    containers: ContainerSummary[];
}

export interface InstalledPackage {
    name: string;
    version: string;
}

export interface VersionsResponse {
    server: {
        name: string;
        version: string;
        node: { version: string; v8: string; platform: string; arch: string };
        packages: InstalledPackage[];
    };
    datastores: DatastoreInfo[];
    /** Every pod in the namespace; `null` outside Kubernetes. */
    pods: PodSummary[] | null;
    podsError?: string;
}

export interface RuntimeResponse {
    inCluster: boolean;
    namespace?: string;
    podName?: string;
    version?: {
        gitVersion: string;
        platform?: string;
        goVersion?: string;
        /** `k3s`, `EKS`, `GKE`, when the version string says so. */
        distribution?: string;
    };
    error?: string;
}

export interface DiskUsage {
    path: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
}

export interface PodUsage {
    name: string;
    self: boolean;
    phase: string;
    kind: ContainerKind;
    cpuCores?: number;
    memoryBytes?: number;
    cpuRequestCores?: number;
    cpuLimitCores?: number;
    memoryRequestBytes?: number;
    memoryLimitBytes?: number;
}

export interface PvcSummary {
    name: string;
    phase: string;
    storageClass?: string;
    accessModes: string[];
    capacityBytes?: number;
    mountedBy: string[];
}

export interface SystemResponse {
    timestamp: string;
    server: {
        uptimeSeconds: number;
        cpu: {
            cores: number;
            /** Percent of one core: 100 is one full core in use. */
            processPercent: number;
            loadAverage: number[];
        };
        memory: {
            rssBytes: number;
            heapUsedBytes: number;
            heapTotalBytes: number;
            externalBytes: number;
            systemTotalBytes: number;
            systemFreeBytes: number;
            containerLimitBytes?: number;
            containerUsedBytes?: number;
        };
        disks: DiskUsage[];
    };
    datastores: DatastoreInfo[];
    /** `null` outside Kubernetes. */
    kubernetes: {
        namespace: string;
        /** `false` when metrics-server isn't installed or the ServiceAccount can't read it. */
        metricsAvailable: boolean;
        pods: PodUsage[];
        pvcs: PvcSummary[];
        error?: string;
    } | null;
}

/** Versions of this server, its packages, its datastores and the namespace's containers. */
export function getVersions(): Promise<VersionsResponse> {
    return apiFetch("/diagnostics/versions");
}

/** The Kubernetes version and where the server is running in it. */
export function getRuntime(): Promise<RuntimeResponse> {
    return apiFetch("/diagnostics/runtime");
}

/** A snapshot of live resource use. Meant to be polled: the CPU figure is measured since the previous call. */
export function getSystem(): Promise<SystemResponse> {
    return apiFetch("/diagnostics/system");
}
