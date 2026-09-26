///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import type { RuntimeResponse, SystemResponse, VersionsResponse } from "../../../../apps/shared/lib/diagnosticsApi.js";

const GiB = 1024 ** 3;

export function makeVersions(overrides: Partial<VersionsResponse> = {}): VersionsResponse {
    return {
        server: {
            name: "auth-server",
            version: "1.0.0-beta.24",
            node: { version: "v24.1.0", v8: "13.6.233", platform: "linux", arch: "x64" },
            packages: [
                { name: "react", version: "19.2.0" },
                { name: "@rapidrest/core", version: "6.0.0" },
                { name: "react", version: "18.3.1" },
            ],
        },
        datastores: [
            { kind: "mongodb", role: "database", version: "8.0.4" },
            { kind: "redis", role: "cache", version: "7.4.1" },
        ],
        pods: [
            {
                name: "auth-server-abc",
                phase: "Running",
                self: true,
                containers: [
                    { name: "auth-server", image: "ghcr.io/rapidrest/auth-server:1.0.0-beta.24", tag: "1.0.0-beta.24", kind: "server", ready: true, restarts: 0 },
                ],
            },
            {
                name: "mongodb-0",
                phase: "Running",
                self: false,
                containers: [
                    { name: "mongodb", image: "docker.io/bitnami/mongodb:8.0.4", tag: "8.0.4", kind: "mongodb", ready: false, restarts: 3 },
                    { name: "metrics", image: "prom/exporter:1", tag: "1", kind: "other", ready: true, restarts: 0 },
                ],
            },
        ],
        ...overrides,
    };
}

export function makeRuntime(overrides: Partial<RuntimeResponse> = {}): RuntimeResponse {
    return {
        inCluster: true,
        namespace: "auth-server",
        podName: "auth-server-abc",
        version: { gitVersion: "v1.30.2+k3s1", platform: "linux/amd64", goVersion: "go1.22", distribution: "k3s" },
        ...overrides,
    };
}

export function makeSystem(overrides: Partial<SystemResponse> = {}): SystemResponse {
    return {
        timestamp: "2026-09-26T10:30:00.000Z",
        server: {
            uptimeSeconds: 93784,
            cpu: { cores: 2, processPercent: 50, loadAverage: [0.5, 0.25, 0.1] },
            memory: {
                rssBytes: 256 * 1024 ** 2,
                heapUsedBytes: 100 * 1024 ** 2,
                heapTotalBytes: 150 * 1024 ** 2,
                externalBytes: 1,
                systemTotalBytes: 16 * GiB,
                systemFreeBytes: 8 * GiB,
                containerLimitBytes: 512 * 1024 ** 2,
                containerUsedBytes: 300 * 1024 ** 2,
            },
            disks: [
                { path: "/app", totalBytes: 10 * GiB, usedBytes: 5 * GiB, availableBytes: 5 * GiB },
                { path: "/data", totalBytes: 0, usedBytes: 0, availableBytes: 0 },
            ],
        },
        datastores: [
            { kind: "mongodb", role: "database", usedBytes: 1 * GiB, totalBytes: 8 * GiB },
            { kind: "redis", role: "cache", usedBytes: 1024 ** 2 },
            { kind: "postgresql", role: "other", error: "connection refused" },
        ],
        kubernetes: {
            namespace: "auth-server",
            metricsAvailable: true,
            pods: [
                {
                    name: "auth-server-abc",
                    self: true,
                    phase: "Running",
                    kind: "server",
                    cpuCores: 0.25,
                    memoryBytes: 256 * 1024 ** 2,
                    cpuRequestCores: 0.1,
                    cpuLimitCores: undefined,
                    memoryRequestBytes: 384 * 1024 ** 2,
                    memoryLimitBytes: 1 * GiB,
                },
                { name: "mongodb-0", self: false, phase: "Running", kind: "mongodb", cpuCores: 0.5, memoryBytes: 512 * 1024 ** 2 },
            ],
            pvcs: [
                { name: "datadir-mongodb-0", phase: "Bound", storageClass: "local-path", accessModes: ["ReadWriteOnce"], capacityBytes: 8 * GiB, mountedBy: ["mongodb-0"] },
                { name: "orphan", phase: "Pending", accessModes: [], mountedBy: [] },
            ],
        },
        ...overrides,
    };
}
