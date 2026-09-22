///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level coverage for BaseDatabaseAuditLogUtils.record(), driven against a stubbed repoUtils rather than a
// live server/database — see AuditLogRoute.{sql,mongo}.test.ts for the real-database integration coverage
// (which also proves this class is really what's registered as `AuditLogUtils`, the same way
// MessageTemplateRoute.*.test.ts proves it for BaseDatabaseMessagingUtils).
import { describe, expect, it, vi } from "vitest";
import { BaseDatabaseAuditLogUtils } from "../src/audit/BaseDatabaseAuditLogUtils.js";

class TestUtilsSQL extends BaseDatabaseAuditLogUtils {
    protected entryClass = { name: "AuditLogEntrySQL" };
}

class TestUtilsMongo extends BaseDatabaseAuditLogUtils {
    protected entryClass = { name: "AuditLogEntryMongo" };
    protected override encodeData(data?: Record<string, unknown>): unknown {
        return data;
    }
}

function withRepo(utils: BaseDatabaseAuditLogUtils, repoUtils: Record<string, any>): void {
    (utils as any)._objectFactory = { newInstance: vi.fn().mockResolvedValue(repoUtils) };
}

describe("BaseDatabaseAuditLogUtils.record()", () => {
    it("throws when the ObjectFactory was never injected", async () => {
        const utils = new TestUtilsSQL();
        await expect(utils.record({ type: "auth.signed_in" })).rejects.toThrow("objectFactory is not set.");
    });

    it("persists the entry via repoUtils.create() with ignoreACL: true", async () => {
        const create = vi.fn().mockResolvedValue({ uid: "e1" });
        const utils = new TestUtilsSQL();
        withRepo(utils, { create });

        await utils.record({
            type: "auth.signed_in",
            userUid: "user-1",
            actorUid: "admin-1",
            ip: "127.0.0.1",
            path: "/api/auth/mfa",
            method: "password",
            data: { secretUid: "s1" },
        });

        expect(create).toHaveBeenCalledWith(
            {
                type: "auth.signed_in",
                userUid: "user-1",
                actorUid: "admin-1",
                ip: "127.0.0.1",
                path: "/api/auth/mfa",
                method: "password",
                data: JSON.stringify({ secretUid: "s1" }),
            },
            { ignoreACL: true },
        );
    });

    it("JSON-serializes data by default (the SQL shape)", async () => {
        const create = vi.fn().mockResolvedValue({});
        const utils = new TestUtilsSQL();
        withRepo(utils, { create });

        await utils.record({ type: "auth.mfa.enrolled", data: { secretType: "totp" } });

        expect(create.mock.calls[0][0].data).toBe(JSON.stringify({ secretType: "totp" }));
    });

    it("leaves data as a real object when the subclass overrides encodeData (the Mongo shape)", async () => {
        const create = vi.fn().mockResolvedValue({});
        const utils = new TestUtilsMongo();
        withRepo(utils, { create });

        await utils.record({ type: "auth.mfa.enrolled", data: { secretType: "totp" } });

        expect(create.mock.calls[0][0].data).toEqual({ secretType: "totp" });
    });

    it("stores data as undefined when the entry has none", async () => {
        const create = vi.fn().mockResolvedValue({});
        const utils = new TestUtilsSQL();
        withRepo(utils, { create });

        await utils.record({ type: "auth.signed_in" });

        expect(create.mock.calls[0][0].data).toBeUndefined();
    });

    it("falls back to undefined instead of failing the whole write when data can't be serialized", async () => {
        const create = vi.fn().mockResolvedValue({});
        const utils = new TestUtilsSQL();
        withRepo(utils, { create });
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        await utils.record({ type: "auth.signed_in", data: circular });

        expect(create.mock.calls[0][0].data).toBeUndefined();
    });

    it("reuses the same repoUtils instance across multiple record() calls", async () => {
        const create = vi.fn().mockResolvedValue({});
        const utils = new TestUtilsSQL();
        const newInstance = vi.fn().mockResolvedValue({ create });
        (utils as any)._objectFactory = { newInstance };

        await utils.record({ type: "auth.signed_in" });
        await utils.record({ type: "auth.signed_in" });

        expect(newInstance).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(2);
    });

    it("lets a genuine write failure reject, rather than swallowing it", async () => {
        const create = vi.fn().mockRejectedValue(new Error("db down"));
        const utils = new TestUtilsSQL();
        withRepo(utils, { create });

        await expect(utils.record({ type: "auth.signed_in" })).rejects.toThrow("db down");
    });
});
