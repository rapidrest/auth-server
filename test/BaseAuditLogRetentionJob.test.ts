///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level coverage for BaseAuditLogRetentionJob, driven against a stubbed repoUtils. The one thing that matters
// most here is the negative case: with nothing configured, run() must NEVER touch the table, since unexpected data
// loss in an audit trail would be a serious regression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAuditLogRetentionJob } from "../src/audit/BaseAuditLogRetentionJob.js";

class TestJob extends BaseAuditLogRetentionJob {
    protected entryClass = { name: "AuditLogEntrySQL" };
}

function makeStartedJob(repoUtils: Record<string, any>, retentionDays: number | null = null): TestJob {
    const job = new TestJob();
    (job as any)._objectFactory = { newInstance: vi.fn().mockResolvedValue(repoUtils) };
    (job as any).repoUtils = repoUtils;
    (job as any).retentionDays = retentionDays;
    return job;
}

describe("BaseAuditLogRetentionJob", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-22T00:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("schedules daily (a cron string), so it's a recurring job, not a one-time one", () => {
        const job = new TestJob();
        expect(job.schedule).toBe("0 3 * * *");
    });

    describe("start()", () => {
        it("throws when the ObjectFactory was never injected", async () => {
            const job = new TestJob();
            await expect(job.start()).rejects.toThrow("objectFactory is not set.");
        });

        it("builds the repo for entryClass", async () => {
            const repoUtils = {};
            const newInstance = vi.fn().mockResolvedValue(repoUtils);
            const job = new TestJob();
            (job as any)._objectFactory = { newInstance };

            await job.start();

            expect(newInstance).toHaveBeenCalledWith(expect.anything(), {
                name: "AuditLogEntrySQL",
                args: [{ name: "AuditLogEntrySQL" }],
            });
        });
    });

    describe("run()", () => {
        it("never purges anything when retentionDays is unset (null) — the default", async () => {
            const truncate = vi.fn();
            const job = makeStartedJob({ truncate }, null);

            await job.run();

            expect(truncate).not.toHaveBeenCalled();
        });

        it("never purges anything when retentionDays is 0 or negative", async () => {
            const truncate = vi.fn();

            await makeStartedJob({ truncate }, 0).run();
            await makeStartedJob({ truncate }, -5).run();

            expect(truncate).not.toHaveBeenCalled();
        });

        it("does nothing if start() was never called (no repoUtils), even if configured", async () => {
            const job = new TestJob();
            (job as any).retentionDays = 30;

            await expect(job.run()).resolves.toBeUndefined();
        });

        it("purges entries older than the configured window when configured", async () => {
            const truncate = vi.fn().mockResolvedValue(undefined);
            const job = makeStartedJob({ truncate }, 30);

            await job.run();

            expect(truncate).toHaveBeenCalledTimes(1);
            const [query, options] = truncate.mock.calls[0];
            expect(options).toEqual({ ignoreACL: true });
            expect(query.dateCreated).toBe("lte(2026-08-23T00:00:00.000Z)");
        });

        it("logs, but does not throw, when the purge write fails", async () => {
            const truncate = vi.fn().mockRejectedValue(new Error("db down"));
            const warn = vi.fn();
            const job = makeStartedJob({ truncate }, 30);
            (job as any).logger = { warn };

            await expect(job.run()).resolves.toBeUndefined();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("db down"));
        });

        it("copes with having no logger when the purge write fails", async () => {
            const truncate = vi.fn().mockRejectedValue(new Error("db down"));
            const job = makeStartedJob({ truncate }, 30);

            await expect(job.run()).resolves.toBeUndefined();
        });
    });

    it("stop() is a no-op", () => {
        const job = new TestJob();
        expect(() => job.stop()).not.toThrow();
    });
});
