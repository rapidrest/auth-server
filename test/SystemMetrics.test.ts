///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { SystemSampler, type MetricsDeps } from "../src/diagnostics/SystemMetrics.js";

const STAT = { bsize: 10, blocks: 100, bfree: 40, bavail: 30 };

function makeDeps(files: Record<string, string> = {}, overrides: Partial<MetricsDeps> = {}): MetricsDeps {
    return {
        now: () => 1000,
        cpuUsage: () => ({ user: 0, system: 0 }),
        readFile: async (path) => {
            if (path in files) return files[path];
            throw new Error("ENOENT");
        },
        statfs: async () => STAT,
        cwd: () => "/app",
        tmpdir: () => "/tmp",
        cpuCount: () => 8,
        loadavg: () => [1, 2, 3],
        totalmem: () => 1000,
        freemem: () => 400,
        memoryUsage: () => ({ rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 }),
        uptime: () => 60,
        ...overrides,
    };
}

describe("SystemSampler", () => {
    it("reports memory, load and uptime with no cgroup limits", async () => {
        const m = await new SystemSampler(makeDeps()).sample();
        expect(m.uptimeSeconds).toBe(60);
        expect(m.cpu).toEqual({ cores: 8, processPercent: 0, loadAverage: [1, 2, 3] });
        expect(m.memory).toEqual({
            rssBytes: 1,
            heapUsedBytes: 2,
            heapTotalBytes: 3,
            externalBytes: 4,
            systemTotalBytes: 1000,
            systemFreeBytes: 400,
            containerLimitBytes: undefined,
            containerUsedBytes: undefined,
        });
    });

    it("measures CPU against the previous sample, as a percentage of one core", async () => {
        let now = 1000;
        let cpu = { user: 0, system: 0 };
        const sampler = new SystemSampler(makeDeps({}, { now: () => now, cpuUsage: () => cpu }));
        await sampler.sample();
        now = 2000; // 1s later, having used 250ms + 250ms of CPU
        cpu = { user: 250_000, system: 250_000 };
        expect((await sampler.sample()).cpu.processPercent).toBeCloseTo(50);
        // A second sample at the same instant has no interval to measure over.
        expect((await sampler.sample()).cpu.processPercent).toBe(0);
    });

    it("uses cgroup v2 limits and the CPU quota", async () => {
        const m = await new SystemSampler(
            makeDeps({
                "/sys/fs/cgroup/memory.max": "2048\n",
                "/sys/fs/cgroup/memory.current": "512\n",
                "/sys/fs/cgroup/cpu.max": "150000 100000\n",
            }),
        ).sample();
        expect(m.cpu.cores).toBe(1.5);
        expect(m.memory.containerLimitBytes).toBe(2048);
        expect(m.memory.containerUsedBytes).toBe(512);
    });

    it("falls back to cgroup v1, and ignores 'max' and unlimited sentinels", async () => {
        const v1 = await new SystemSampler(
            makeDeps({
                "/sys/fs/cgroup/memory.max": "max",
                "/sys/fs/cgroup/memory/memory.limit_in_bytes": "4096",
                "/sys/fs/cgroup/memory/memory.usage_in_bytes": "1024",
                "/sys/fs/cgroup/cpu.max": "max 100000",
            }),
        ).sample();
        expect(v1.memory).toMatchObject({ containerLimitBytes: 4096, containerUsedBytes: 1024 });
        expect(v1.cpu.cores).toBe(8);

        const unlimited = await new SystemSampler(
            makeDeps({ "/sys/fs/cgroup/memory/memory.limit_in_bytes": "9223372036854771712" }),
        ).sample();
        expect(unlimited.memory.containerLimitBytes).toBeUndefined();
    });

    it("reports the working and temp directories and this pod's real mounts, once per distinct filesystem", async () => {
        const stated: string[] = [];
        const mounts = [
            "overlay / overlay rw 0 0",
            "proc /proc proc rw 0 0",
            "/dev/sda1 /etc/hosts ext4 rw 0 0",
            "/dev/sdb1 /data ext4 rw 0 0",
            "/dev/sdc1 /var/lib/cache xfs rw 0 0",
            "tmpfs /dev/shm tmpfs rw 0 0",
            "shm /run/secrets ext4 rw 0 0",
            "malformed",
            "two /fields",
            "",
        ].join("\n");
        const m = await new SystemSampler(
            makeDeps(
                { "/proc/self/mounts": mounts },
                {
                    statfs: async (path) => {
                        stated.push(path);
                        if (path === "/var/lib/cache") throw new Error("EACCES");
                        // /app, /tmp and / share one filesystem; /data is another.
                        return path === "/data" ? { ...STAT, blocks: 200 } : STAT;
                    },
                },
            ),
        ).sample();
        expect(stated.sort()).toEqual(["/", "/app", "/data", "/tmp", "/var/lib/cache"]);
        expect(m.disks).toEqual([
            { path: "/app", totalBytes: 1000, usedBytes: 600, availableBytes: 300 },
            { path: "/data", totalBytes: 2000, usedBytes: 1600, availableBytes: 300 },
        ]);
    });

    it("samples the real host without failing", async () => {
        const m = await new SystemSampler().sample();
        expect(m.cpu.cores).toBeGreaterThan(0);
        expect(m.memory.rssBytes).toBeGreaterThan(0);
        expect(m.disks.length).toBeGreaterThan(0);
    });
});
