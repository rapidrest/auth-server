///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// End-to-end integration coverage for the local `DiagnosticsRoute` against a real (if lightweight) running server:
// that it's discovered and mounted at `/api/admin/diagnostics` beside the framework's admin endpoints, that it's gated
// behind the trusted role *and* a fresh elevation, and that its three endpoints (`/versions`, `/runtime`, `/metrics`)
// answer for a process that is not running in Kubernetes. The collectors' logic, against a stubbed Kubernetes API, is in
// `test/diagnostics/`, and the route class's declarations in `test/diagnostics/DiagnosticsRoute.test.ts`.
// This is `DiagnosticsRoute.sql.test.ts`'s Mongo twin, matching this app's convention of mirroring every feature across
// both datastores. See `AuditLogRoute.mongo.test.ts` for the bootstrap pattern.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { Logger } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { importArgon2, normalizePasswordSubmission, PasswordConfig } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";

const PASSWORD = "S3cret!Pass123";
const ENDPOINTS = ["/api/admin/diagnostics/versions", "/api/admin/diagnostics/runtime", "/api/admin/diagnostics/metrics"];

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-diagnostics-test",
    },
});

describe("DiagnosticsRoute (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    async function signIn(testAgent: ReturnType<typeof agent>, username: string, roles: string[]): Promise<void> {
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

        const res = await testAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (res.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${res.status} ${JSON.stringify(res.body)}`);
        }
    }

    async function elevatedAdmin(username: string): Promise<ReturnType<typeof agent>> {
        const admin = agent(server);
        await signIn(admin, username, ["admin"]);
        const res = await admin.post("/api/auth/elevation").send({ password: PASSWORD });
        if (res.status !== 200) {
            throw new Error(`Elevation failed for test setup: ${res.status} ${JSON.stringify(res.body)}`);
        }
        return admin;
    }

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    describe("gating", () => {
        it.each(ENDPOINTS)("GET %s rejects an anonymous caller", async (path) => {
            expect((await request(server).get(path)).status).toBe(401);
        });

        it.each(ENDPOINTS)("GET %s rejects a caller without the trusted 'admin' role", async (path) => {
            const plain = agent(server);
            await signIn(plain, `plain-${path.split("/").pop()}`, []);
            expect((await plain.get(path)).status).toBe(403);
        });

        it.each(ENDPOINTS)("GET %s rejects an admin who hasn't elevated", async (path) => {
            const admin = agent(server);
            await signIn(admin, `unelevated-${path.split("/").pop()}`, ["admin"]);
            expect((await admin.get(path)).status).toBe(403);
        });
    });

    describe("as an elevated admin", () => {
        it("reports the server's versions and installed packages, and that the other containers are unknown outside Kubernetes", async () => {
            const admin = await elevatedAdmin("admin-versions");

            const res = await admin.get("/api/admin/diagnostics/versions");

            expect(res.status).toBe(200);
            expect(res.body.server.packageName).toBe("auth-server");
            expect(res.body.server.nodeVersion).toBe(process.version);
            expect(res.body.packages.some((p: any) => p.name === "@rapidrest/service-core")).toBe(true);
            expect(res.body.components.map((c: any) => c.component)).toEqual(["mongodb", "postgresql", "redis"]);
            expect(res.body.components.every((c: any) => c.status === "unknown")).toBe(true);
            expect(res.body.kubernetes.available).toBe(false);
            expect(res.body.kubernetes.reason).toMatch(/not running in Kubernetes/);
        });

        it("reports that it isn't running in Kubernetes", async () => {
            const admin = await elevatedAdmin("admin-runtime");
            const res = await admin.get("/api/admin/diagnostics/runtime");
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ available: false, nodes: [] });
        });

        it("reports live figures, which change from one poll to the next", async () => {
            const admin = await elevatedAdmin("admin-metrics");

            const first = await admin.get("/api/admin/diagnostics/metrics");
            const second = await admin.get("/api/admin/diagnostics/metrics");

            expect(first.status).toBe(200);
            expect(first.body.process.rssBytes).toBeGreaterThan(0);
            expect(first.body.host.cpuCount).toBeGreaterThan(0);
            expect(first.body.host.disks.length).toBeGreaterThan(0);
            expect(first.body.kubernetes).toMatchObject({ available: false, pvcs: [], errors: [] });
            expect(new Date(second.body.collectedAt).getTime()).toBeGreaterThanOrEqual(new Date(first.body.collectedAt).getTime());
        });
    });
});
