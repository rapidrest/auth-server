///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { readFile, statfs } from "node:fs/promises";
import os from "node:os";

/** Filesystem types worth reporting when listing this pod's mounts; pseudo-filesystems (`proc`, `tmpfs`, …) are not. */
const DISK_FS_TYPES = /^(ext[234]|xfs|btrfs|zfs|overlay|nfs4?|cifs|ceph|fuse(\..+)?)$/;

export interface DiskUsage {
    path: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
}

export interface ServerMetrics {
    uptimeSeconds: number;
    cpu: {
        /** CPUs available to the process: the container's CPU quota when it has one, else every core of the host. */
        cores: number;
        /** This process's CPU use since the previous sample, as a percentage of one core (100 = one full core). */
        processPercent: number;
        loadAverage: number[];
    };
    memory: {
        rssBytes: number;
        heapUsedBytes: number;
        heapTotalBytes: number;
        externalBytes: number;
        /** The host's memory (`os.totalmem()`) — inside a container this is the node's, not the pod's. */
        systemTotalBytes: number;
        systemFreeBytes: number;
        /** The container's cgroup limit and current use, when running under one that sets a limit. */
        containerLimitBytes?: number;
        containerUsedBytes?: number;
    };
    disks: DiskUsage[];
}

/** Everything sampling touches outside its own code, so it can be substituted in tests. */
export interface MetricsDeps {
    now: () => number;
    cpuUsage: () => NodeJS.CpuUsage;
    readFile: (path: string) => Promise<string>;
    statfs: (path: string) => Promise<{ bsize: number; blocks: number; bfree: number; bavail: number }>;
    cwd: () => string;
    tmpdir: () => string;
    cpuCount: () => number;
    loadavg: () => number[];
    totalmem: () => number;
    freemem: () => number;
    memoryUsage: () => NodeJS.MemoryUsage;
    uptime: () => number;
}

const defaultDeps: MetricsDeps = {
    now: Date.now,
    cpuUsage: () => process.cpuUsage(),
    readFile: (path) => readFile(path, "utf-8"),
    statfs: (path) => statfs(path),
    cwd: () => process.cwd(),
    tmpdir: () => os.tmpdir(),
    cpuCount: () => os.availableParallelism(),
    loadavg: () => os.loadavg(),
    totalmem: () => os.totalmem(),
    freemem: () => os.freemem(),
    memoryUsage: () => process.memoryUsage(),
    uptime: () => process.uptime(),
};

/** Reads a file that may not exist (cgroup files, `/proc`), giving `undefined` instead of throwing. */
async function tryRead(deps: MetricsDeps, path: string): Promise<string | undefined> {
    try {
        return (await deps.readFile(path)).trim();
    } catch {
        return undefined;
    }
}

/** A cgroup limit file's value, where `max` (cgroup v2) and the huge sentinels of v1 both mean "unlimited". */
function parseLimit(raw: string | undefined): number | undefined {
    const value = Number(raw);
    return raw && Number.isFinite(value) && value > 0 && value < 2 ** 60 ? value : undefined;
}

/** The container's memory limit and use from cgroup v2, falling back to v1. Empty when it isn't limited. */
async function readContainerMemory(deps: MetricsDeps): Promise<{ limit?: number; used?: number }> {
    let limit = parseLimit(await tryRead(deps, "/sys/fs/cgroup/memory.max"));
    let used = parseLimit(await tryRead(deps, "/sys/fs/cgroup/memory.current"));
    if (limit === undefined) {
        limit = parseLimit(await tryRead(deps, "/sys/fs/cgroup/memory/memory.limit_in_bytes"));
        used = parseLimit(await tryRead(deps, "/sys/fs/cgroup/memory/memory.usage_in_bytes"));
    }
    return limit === undefined ? {} : { limit, used };
}

/** The container's CPU quota in cores from cgroup v2's `cpu.max` (`<quota> <period>`), when it has one. */
async function readCpuQuota(deps: MetricsDeps): Promise<number | undefined> {
    const [quota, period] = ((await tryRead(deps, "/sys/fs/cgroup/cpu.max")) ?? "").split(" ");
    const cores = Number(quota) / Number(period);
    return Number.isFinite(cores) && cores > 0 ? cores : undefined;
}

/** Total/used/available space of the filesystem at `path`, or `undefined` if it can't be read. */
async function readDisk(deps: MetricsDeps, path: string): Promise<DiskUsage | undefined> {
    try {
        const s = await deps.statfs(path);
        const totalBytes = s.blocks * s.bsize;
        return { path, totalBytes, usedBytes: totalBytes - s.bfree * s.bsize, availableBytes: s.bavail * s.bsize };
    } catch {
        return undefined;
    }
}

/** The working directory, the temp directory and every real-filesystem mount of this pod (its volumes/PVCs). */
async function readDisks(deps: MetricsDeps): Promise<DiskUsage[]> {
    const paths = new Set<string>([deps.cwd(), deps.tmpdir()]);
    for (const line of ((await tryRead(deps, "/proc/self/mounts")) ?? "").split("\n")) {
        const [, mountPoint, fsType] = line.split(" ");
        if (mountPoint && DISK_FS_TYPES.test(fsType ?? "") && !/^\/(etc|dev|proc|sys|run)(\/|$)/.test(mountPoint)) {
            paths.add(mountPoint);
        }
    }
    const disks = await Promise.all([...paths].map((path) => readDisk(deps, path)));
    // Several paths can sit on one filesystem (the cwd and `/` on overlay); keep each distinct one once.
    const seen = new Set<string>();
    return disks.filter((disk): disk is DiskUsage => {
        if (!disk) {
            return false;
        }
        const key = `${disk.totalBytes}:${disk.usedBytes}:${disk.availableBytes}`;
        return !seen.has(key) && !!seen.add(key);
    });
}

/**
 * Samples this server's own CPU, memory and disk use. CPU is a rate, so it's measured against the previous call:
 * keep one sampler for the life of the process and call `sample()` on each poll.
 */
export class SystemSampler {
    private last?: { at: number; usage: NodeJS.CpuUsage };

    constructor(private readonly deps: MetricsDeps = defaultDeps) {}

    public async sample(): Promise<ServerMetrics> {
        const { deps } = this;
        const now = deps.now();
        const usage = deps.cpuUsage();
        let processPercent = 0;
        if (this.last && now > this.last.at) {
            const cpuMs = (usage.user - this.last.usage.user + usage.system - this.last.usage.system) / 1000;
            processPercent = (cpuMs / (now - this.last.at)) * 100;
        }
        this.last = { at: now, usage };

        const [container, quota, disks] = await Promise.all([
            readContainerMemory(deps),
            readCpuQuota(deps),
            readDisks(deps),
        ]);
        const memory = deps.memoryUsage();
        return {
            uptimeSeconds: deps.uptime(),
            cpu: { cores: quota ?? deps.cpuCount(), processPercent, loadAverage: deps.loadavg() },
            memory: {
                rssBytes: memory.rss,
                heapUsedBytes: memory.heapUsed,
                heapTotalBytes: memory.heapTotal,
                externalBytes: memory.external,
                systemTotalBytes: deps.totalmem(),
                systemFreeBytes: deps.freemem(),
                containerLimitBytes: container.limit,
                containerUsedBytes: container.used,
            },
            disks,
        };
    }
}
