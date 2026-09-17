///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end HTTP coverage confirming the dedicated `/api/settings` route (registration/MFA policy — see
// `@rapidrest/auth`'s `BaseSettingsRoute`) is correctly wired into this app's real server: mounted at
// `/api/settings` (not `/api/settings/branding`, which `SiteSettingsRoute.sql.test.ts` covers), reachable
// through the real `AuthMiddleware`/ACL/elevation stack. The route's own logic (validation, scope-gating,
// partial updates) is already exercised in depth by the library's own `SettingsRoute.test.ts`; this file
// only needs to confirm this app wires it up correctly.
//
// Tokens are minted directly (as `UserRoute.test.ts`-style tests do), bypassing `POST /api/auth/mfa` —
// this file only cares about `/api/settings` itself, not the sign-in flow.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { JWTUtils, Logger } from "@rapidrest/core";
import { ConnectionManager, MongoConnection, MongoRepository, ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { request } from "@rapidrest/service-core/test";
import * as uuid from "uuid";
import { SystemSettingsMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-settings-route-test",
    },
});

describe("SettingsRoute (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });
    const baseUrl = "/api/settings";
    let settingsRepo: MongoRepository<SystemSettingsMongo>;

    const admin: any = { uid: uuid.v4(), roles: ["admin"], elevated: Date.now() };
    const adminToken = JWTUtils.createTokenSync(config.get("auth"), admin);
    const user: any = { uid: uuid.v4(), roles: [] };
    const userToken = JWTUtils.createTokenSync(config.get("auth"), user);

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        await server.start();

        const connMgr: ConnectionManager | undefined = objectFactory.getInstance(ConnectionManager);
        const conn: any = connMgr?.connections.get("mongo");
        if (conn instanceof MongoConnection) {
            settingsRepo = conn.getMongoRepository(SystemSettingsMongo.name);
        } else {
            throw new Error("Could not find mongo connection");
        }
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    beforeEach(async () => {
        try {
            await settingsRepo.clear();
        } catch (err: any) {
            if (err.message !== "ns not found") {
                throw err;
            }
        }
    });

    it("mounts GET at /api/settings, public, creating the default row on first access", async () => {
        const res = await request(server).get(baseUrl);

        expect(res.status).toBe(200);
        expect(res.body.allowRegistration).toBe(true);
        expect("requireMFA" in res.body).toBe(false);
        expect(await settingsRepo.count()).toBe(1);
    });

    it("mounts PUT at /api/settings, rejecting a caller without the trusted 'admin' role", async () => {
        const res = await request(server)
            .put(baseUrl)
            .set("Authorization", "jwt " + userToken)
            .send({ allowRegistration: false });

        expect(res.status).toBe(403);
    });

    it("mounts PUT at /api/settings, letting an admin change allowRegistration/requireMFA", async () => {
        const res = await request(server)
            .put(baseUrl)
            .set("Authorization", "jwt " + adminToken)
            .send({ allowRegistration: false, requireMFA: true });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ allowRegistration: false, requireMFA: true });

        const stored = await settingsRepo.findOne({ uid: "default" });
        expect(stored).toMatchObject({ allowRegistration: false, requireMFA: true });
    });

    it("is mounted separately from the branding settings at /api/settings/branding (no route collision)", async () => {
        const settings = await request(server).get("/api/settings");
        const branding = await request(server).get("/api/settings/branding");

        expect(settings.status).toBe(200);
        expect(branding.status).toBe(200);
        expect(settings.body).not.toHaveProperty("logoUploaded");
        expect(branding.body).not.toHaveProperty("allowRegistration");
    });
});
