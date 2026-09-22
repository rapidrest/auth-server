///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level coverage for BaseAuditLogRoute's own logic (default sort, pagination pass-through, the
// uninitialized-repoUtils guard, 404 on a missing entry), driven against a stubbed repoUtils rather than a live
// server — see AuditLogRoute.{sql,mongo}.test.ts for the real HTTP/database integration coverage (auth/trusted-role
// gating, real filtering, that no POST/PUT/DELETE exists).
import { describe, expect, it, vi } from "vitest";
import { ApiErrors } from "@rapidrest/service-core";
import { BaseAuditLogRoute } from "../src/routes/BaseAuditLogRoute.js";

class TestAuditLogRoute extends BaseAuditLogRoute {
    protected entryClass = { name: "AuditLogEntrySQL" };
}

function makeRoute(repoUtils: Record<string, any>): TestAuditLogRoute {
    const route = new TestAuditLogRoute();
    (route as any).repoUtils = repoUtils;
    return route;
}

const USER = { uid: "admin-1", roles: ["admin"] } as any;

function entry(overrides: Record<string, any> = {}) {
    return {
        uid: "e1",
        version: 0,
        dateCreated: new Date("2026-09-22T00:00:00.000Z"),
        dateModified: new Date("2026-09-22T00:00:00.000Z"),
        type: "auth.signed_in",
        ...overrides,
    };
}

describe("BaseAuditLogRoute", () => {
    describe("initialize()", () => {
        it("throws when the ObjectFactory was never injected", async () => {
            const route = new TestAuditLogRoute();
            await expect((route as any).initialize()).rejects.toThrow("objectFactory is not set.");
        });

        it("does not recreate repoUtils if it's already set", async () => {
            const route = new TestAuditLogRoute();
            const existing = {};
            (route as any).repoUtils = existing;
            (route as any)._objectFactory = { newInstance: vi.fn() };

            await (route as any).initialize();

            expect((route as any)._objectFactory.newInstance).not.toHaveBeenCalled();
            expect((route as any).repoUtils).toBe(existing);
        });

        it("builds the repo for entryClass when unset", async () => {
            const route = new TestAuditLogRoute();
            const repoUtils = {};
            const newInstance = vi.fn().mockResolvedValue(repoUtils);
            (route as any)._objectFactory = { newInstance };

            await (route as any).initialize();

            expect(newInstance).toHaveBeenCalledWith(expect.anything(), {
                name: "AuditLogEntrySQL",
                args: [{ name: "AuditLogEntrySQL" }],
            });
            expect((route as any).repoUtils).toBe(repoUtils);
        });
    });

    describe("uninitialized repoUtils guards", () => {
        it("list() throws INTERNAL_ERROR when repoUtils is unset", async () => {
            const route = new TestAuditLogRoute();
            await expect(route.list({}, USER)).rejects.toMatchObject({ code: ApiErrors.INTERNAL_ERROR });
        });

        it("get() throws INTERNAL_ERROR when repoUtils is unset", async () => {
            const route = new TestAuditLogRoute();
            await expect(route.get("e1", USER)).rejects.toMatchObject({ code: ApiErrors.INTERNAL_ERROR });
        });
    });

    describe("list", () => {
        it("defaults sort to -dateCreated (newest first) when the caller supplies none", async () => {
            const find = vi.fn().mockResolvedValue([]);
            const route = makeRoute({ find });

            await route.list({}, USER);

            expect(find).toHaveBeenCalledWith(
                { sort: "-dateCreated" },
                { limit: undefined, page: undefined, user: USER, ignoreACL: true },
            );
        });

        it("keeps the caller's own sort untouched", async () => {
            const find = vi.fn().mockResolvedValue([]);
            const route = makeRoute({ find });

            await route.list({ sort: "type" }, USER);

            expect(find.mock.calls[0][0].sort).toBe("type");
        });

        it("passes filters, page and limit straight through to repoUtils.find()", async () => {
            const find = vi.fn().mockResolvedValue([]);
            const route = makeRoute({ find });

            await route.list({ userUid: "eq(user-1)", type: "in(auth.signed_in,auth.elevated)", page: "2", limit: "10" }, USER);

            const [query, options] = find.mock.calls[0];
            expect(query).toMatchObject({
                userUid: "eq(user-1)",
                type: "in(auth.signed_in,auth.elevated)",
                page: "2",
                limit: "10",
                sort: "-dateCreated",
            });
            expect(options).toMatchObject({ page: "2", limit: "10", ignoreACL: true });
        });

        it("always passes ignoreACL: true — reads never go through the model's own (deny-all) ACL", async () => {
            const find = vi.fn().mockResolvedValue([]);
            const route = makeRoute({ find });

            await route.list({}, USER);

            expect(find.mock.calls[0][1].ignoreACL).toBe(true);
        });

        it("maps every result through toAuditLogEntryDTO, normalizing stored JSON-text data", async () => {
            const find = vi.fn().mockResolvedValue([entry({ data: '{"secretUid":"s1"}' }), entry({ uid: "e2" })]);
            const route = makeRoute({ find });

            const result = await route.list({}, USER);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ uid: "e1", data: { secretUid: "s1" } });
            expect(result[1]).toMatchObject({ uid: "e2" });
            expect(result[1].data).toBeUndefined();
        });
    });

    describe("get", () => {
        it("returns the mapped entry when found", async () => {
            const findOne = vi.fn().mockResolvedValue(entry({ userUid: "user-1" }));
            const route = makeRoute({ findOne });

            const result = await route.get("e1", USER);

            expect(findOne).toHaveBeenCalledWith("e1", { ignoreACL: true, user: USER });
            expect(result).toMatchObject({ uid: "e1", userUid: "user-1" });
        });

        it("404s when no entry matches", async () => {
            const findOne = vi.fn().mockResolvedValue(undefined);
            const route = makeRoute({ findOne });

            await expect(route.get("missing", USER)).rejects.toMatchObject({ code: ApiErrors.NOT_FOUND });
        });
    });
});
