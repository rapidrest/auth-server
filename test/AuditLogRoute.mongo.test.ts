///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end integration coverage for the local `AuditLogRoute` — see `AuditLogRoute.sql.test.ts`'s own doc
// comment for the full rationale; this is its Mongo twin, matching this app's convention of mirroring every
// feature across both datastores.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { Logger } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { AuditLogUtils, importArgon2, normalizePasswordSubmission, PasswordConfig } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";
import { BaseDatabaseAuditLogUtils } from "../src/audit/BaseDatabaseAuditLogUtils.js";

const PASSWORD = "S3cret!Pass123";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-audit-log-test",
    },
});

describe("AuditLogRoute (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    let auditUtils: BaseDatabaseAuditLogUtils;

    async function createAndSignInUser(
        testAgent: ReturnType<typeof agent>,
        username: string,
        roles: string[] = [],
    ): Promise<string> {
        const userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserMongo", args: [UserMongo] });
        const aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasMongo", args: [AliasMongo] });
        const secretRepo = await objectFactory.newInstance(RepoUtils, { name: "SecretMongo", args: [SecretMongo] });

        const user = await userRepo.create({ roles, scopes: [], verified: true }, { ignoreACL: true });
        await aliasRepo.create({ alias: username, type: "name", userUid: user.uid, verified: true }, { ignoreACL: true });
        const argon = await importArgon2();
        const normalized = await normalizePasswordSubmission(PASSWORD, user.uid, new PasswordConfig());
        await secretRepo.create(
            { type: "password", data: await argon.hash(normalized), userUid: user.uid },
            { ignoreACL: true },
        );

        const signInRes = await testAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (signInRes.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${signInRes.status} ${JSON.stringify(signInRes.body)}`);
        }
        return user.uid;
    }

    async function elevate(testAgent: ReturnType<typeof agent>): Promise<void> {
        const res = await testAgent.post("/api/auth/elevation").send({ password: PASSWORD });
        if (res.status !== 200) {
            throw new Error(`Elevation failed for test setup: ${res.status} ${JSON.stringify(res.body)}`);
        }
    }

    async function createSignedInTrustedAgent(username: string): Promise<ReturnType<typeof agent>> {
        const trustedAgent = agent(server);
        await createAndSignInUser(trustedAgent, username, ["admin"]);
        await elevate(trustedAgent);
        return trustedAgent;
    }

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        await server.start();

        // See AuditLogRoute.sql.test.ts's own comment: nothing in this repo yet has an `@Inject(AuditLogUtils)`
        // field to trigger the swapped class's instantiation on its own, so this mirrors how that injection would
        // resolve once `@rapidrest/auth`'s real call sites are installed.
        auditUtils = await objectFactory.newInstance(AuditLogUtils, { name: "AuditLogUtils", initialize: true });
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    describe("the database-backed AuditLogUtils", () => {
        it("is what the server runs, not the stock (log-only) class", () => {
            expect(auditUtils).toBeInstanceOf(BaseDatabaseAuditLogUtils);
        });
    });

    describe("trusted-role gating", () => {
        it("GET / rejects an anonymous caller", async () => {
            const res = await request(server).get("/api/audit-log");
            expect(res.status).toBe(401);
        });

        it("GET / rejects a caller without the trusted 'admin' role", async () => {
            const plainAgent = agent(server);
            await createAndSignInUser(plainAgent, "plain-user-list");

            const res = await plainAgent.get("/api/audit-log");

            expect(res.status).toBe(403);
        });

        it("GET / rejects a non-elevated trusted-role caller", async () => {
            const adminAgent = agent(server);
            await createAndSignInUser(adminAgent, "admin-not-elevated-list", ["admin"]);

            const res = await adminAgent.get("/api/audit-log");

            expect(res.status).toBe(403);
        });

        it("GET /:id rejects an anonymous caller", async () => {
            const res = await request(server).get("/api/audit-log/nonexistent");
            expect(res.status).toBe(401);
        });

        it("GET /:id rejects a caller without the trusted 'admin' role", async () => {
            const plainAgent = agent(server);
            await createAndSignInUser(plainAgent, "plain-user-get");

            const res = await plainAgent.get("/api/audit-log/nonexistent");

            expect(res.status).toBe(403);
        });
    });

    describe("no write endpoints exist", () => {
        it("POST / does not exist", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-no-post");
            const res = await adminAgent.post("/api/audit-log").send({ type: "auth.signed_in" });
            expect(res.status).toBe(404);
        });

        it("PUT /:id does not exist", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-no-put");
            const res = await adminAgent.put("/api/audit-log/whatever").send({ type: "auth.signed_in" });
            expect(res.status).toBe(404);
        });

        it("DELETE /:id does not exist", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-no-delete");
            const res = await adminAgent.delete("/api/audit-log/whatever");
            expect(res.status).toBe(404);
        });
    });

    describe("list and detail", () => {
        it("record() persists an entry, and GET /:id reads it back with data round-tripped", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-roundtrip");
            const before = Date.now();

            await auditUtils.record({
                type: "auth.app_password.created",
                userUid: "user-rt-1",
                actorUid: "admin-rt-1",
                ip: "203.0.113.5",
                path: "/api/secrets",
                method: "app-password",
                data: { secretUid: "secret-1", scopes: ["a", "b"] },
            });

            const listRes = await adminAgent.get("/api/audit-log?userUid=eq(user-rt-1)");
            expect(listRes.status).toBe(200);
            expect(listRes.body).toHaveLength(1);
            const [summary] = listRes.body;
            expect(summary).toMatchObject({
                type: "auth.app_password.created",
                userUid: "user-rt-1",
                actorUid: "admin-rt-1",
                ip: "203.0.113.5",
                path: "/api/secrets",
                method: "app-password",
                data: { secretUid: "secret-1", scopes: ["a", "b"] },
            });
            expect(new Date(summary.dateCreated).getTime()).toBeGreaterThanOrEqual(before);

            const getRes = await adminAgent.get(`/api/audit-log/${summary.uid}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body).toEqual(summary);
        });

        it("GET /:id 404s for a uid that doesn't exist", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-get-404");
            const res = await adminAgent.get("/api/audit-log/does-not-exist");
            expect(res.status).toBe(404);
        });

        it("defaults to newest-first (sort=-dateCreated)", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-sort-default");
            const userUid = "user-sort-order";
            await auditUtils.record({ type: "auth.signed_in", userUid });
            await new Promise((resolve) => setTimeout(resolve, 5));
            await auditUtils.record({ type: "auth.elevated", userUid });
            await new Promise((resolve) => setTimeout(resolve, 5));
            await auditUtils.record({ type: "auth.mfa.enrolled", userUid });

            const res = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})`);

            expect(res.status).toBe(200);
            expect(res.body.map((e: any) => e.type)).toEqual(["auth.mfa.enrolled", "auth.elevated", "auth.signed_in"]);
        });

        it("filters by type=in(...)", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-type-filter");
            const userUid = "user-type-filter";
            await auditUtils.record({ type: "auth.signed_in", userUid });
            await auditUtils.record({ type: "auth.elevated", userUid });
            await auditUtils.record({ type: "auth.impersonated", userUid });

            const res = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})&type=in(auth.signed_in,auth.impersonated)`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body.map((e: any) => e.type).sort()).toEqual(["auth.impersonated", "auth.signed_in"]);
        });

        it("paginates via page/limit", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-paginate");
            const userUid = "user-paginate";
            for (let i = 0; i < 5; i++) {
                await auditUtils.record({ type: "auth.signed_in", userUid, method: `m${i}` });
            }

            const page0 = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})&limit=2&page=0`);
            const page1 = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})&limit=2&page=1`);

            expect(page0.body).toHaveLength(2);
            expect(page1.body).toHaveLength(2);
            const page0Uids = page0.body.map((e: any) => e.uid);
            const page1Uids = page1.body.map((e: any) => e.uid);
            expect(page0Uids.some((uid: string) => page1Uids.includes(uid))).toBe(false);
        });

        it("honors an explicit sort", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-explicit-sort");
            const userUid = "user-explicit-sort";
            await auditUtils.record({ type: "b.type", userUid });
            await auditUtils.record({ type: "a.type", userUid });

            const res = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})&sort=type`);

            expect(res.body.map((e: any) => e.type)).toEqual(["a.type", "b.type"]);
        });

        it("an entry with no data comes back with data undefined, never null or an empty object", async () => {
            const adminAgent = await createSignedInTrustedAgent("admin-no-data");
            const userUid = "user-no-data";
            await auditUtils.record({ type: "auth.signed_in", userUid });

            const res = await adminAgent.get(`/api/audit-log?userUid=eq(${userUid})`);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].data).toBeUndefined();
        });
    });

    describe("a genuine write failure propagates rather than being swallowed", () => {
        it("record() rejects when the repository write fails", async () => {
            const repo = await (auditUtils as any).repo();
            const original = repo.create.bind(repo);
            repo.create = async () => {
                throw new Error("simulated write failure");
            };

            await expect(auditUtils.record({ type: "auth.signed_in", userUid: "user-fail" })).rejects.toThrow(
                "simulated write failure",
            );

            repo.create = original;
        });
    });
});
