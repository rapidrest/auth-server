///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end integration coverage for the local `SiteSettingsRoute` — see `SiteSettingsRoute.sql.test.ts`'s
// own doc comment for the full rationale; this is its Mongo twin, matching this app's convention of
// mirroring every feature across both datastores.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { Logger } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { importArgon2 } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";

const PASSWORD = "S3cret!Pass123";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-site-settings-test",
    },
});

// A valid, minimal 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

describe("SiteSettingsRoute (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    /**
     * Provisions a real account and signs it in via `/api/auth/mfa`, same as `OAuthIntegration.mongo.test.ts`.
     * A normal sign-in mints a *non-elevated* token with every trusted role stripped
     * (`TokenUtils.resolveTokenUser()` in `@rapidrest/auth`) — only an elevated session actually carries
     * `admin` in its `roles` claim — so a caller that needs to pass `@RequiresTrustedRole()` must also
     * elevate via `POST /api/auth/elevation` (password re-verification) afterward.
     */
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
        await secretRepo.create(
            { type: "password", data: await argon.hash(PASSWORD), userUid: user.uid },
            { ignoreACL: true },
        );

        const signInRes = await testAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (signInRes.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${signInRes.status} ${JSON.stringify(signInRes.body)}`);
        }
        return user.uid;
    }

    /** Elevates the given (already signed-in) agent's session via password re-verification. */
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
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    it("GET / is public and creates the default row on first access", async () => {
        const res = await request(server).get("/api/settings");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ logoUploaded: false, stylesheetUploaded: false });
    });

    it("PUT / rejects a caller without the trusted 'admin' role", async () => {
        const plainAgent = agent(server);
        await createAndSignInUser(plainAgent, "plain-user");

        const res = await plainAgent.put("/api/settings").send({ siteTitle: "Nope" });

        expect(res.status).toBe(403);
    });

    it("PUT / rejects an anonymous caller", async () => {
        const res = await request(server).put("/api/settings").send({ siteTitle: "Nope" });
        expect(res.status).toBe(401);
    });

    it("PUT / rejects a non-elevated trusted-role caller", async () => {
        const adminAgent = agent(server);
        await createAndSignInUser(adminAgent, "admin-not-elevated", ["admin"]);

        const res = await adminAgent.put("/api/settings").send({ siteTitle: "Nope" });

        expect(res.status).toBe(403);
    });

    it("PUT / updates fields for an elevated trusted admin with partial-update semantics", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-settings-1");

        const first = await adminAgent
            .put("/api/settings")
            .send({ siteTitle: "Acme Corp", companyName: "Acme", logoUrl: "https://example.com/logo.png" });
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            siteTitle: "Acme Corp",
            companyName: "Acme",
            logoUrl: "https://example.com/logo.png",
        });

        const second = await adminAgent.put("/api/settings").send({ companyName: null });
        expect(second.status).toBe(200);
        expect(second.body.siteTitle).toBe("Acme Corp");
        expect(second.body.companyName).toBeUndefined();
    });

    it("uploads, serves, and deletes a logo image (trusted only)", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-logo");

        const uploadRes = await adminAgent.post("/api/settings/logo").set("Content-Type", "image/png").send(PNG_BYTES);
        expect(uploadRes.status).toBe(200);
        expect(uploadRes.body.logoUploaded).toBe(true);

        // See the sql test's own comment: this app's `request()` test helper reads every response as
        // text, so only content-type/wiring is asserted here — exact byte round-tripping is covered by
        // `BaseSiteSettingsRoute.test.ts`.
        const getRes = await request(server).get("/api/settings/logo");
        expect(getRes.status).toBe(200);
        expect(getRes.headers["content-type"]).toBe("image/png");
        expect(getRes.text.length).toBeGreaterThan(0);

        const deleteRes = await adminAgent.delete("/api/settings/logo");
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.logoUploaded).toBe(false);

        const missingRes = await request(server).get("/api/settings/logo");
        expect(missingRes.status).toBe(404);
    });

    it("rejects an unsupported logo content type", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-logo-bad-type");

        const res = await adminAgent.post("/api/settings/logo").set("Content-Type", "application/pdf").send(Buffer.from("x"));

        expect(res.status).toBe(400);
    });

    it("rejects an oversized logo upload", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-logo-too-big");
        const big = Buffer.alloc(2 * 1024 * 1024 + 1);

        const res = await adminAgent.post("/api/settings/logo").set("Content-Type", "image/png").send(big);

        expect(res.status).toBe(413);
    });

    it("uploads, serves, and deletes a stylesheet (trusted only)", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-css");
        const css = "body { background: red; }";

        const uploadRes = await adminAgent.post("/api/settings/stylesheet").set("Content-Type", "text/css").send(css);
        expect(uploadRes.status).toBe(200);
        expect(uploadRes.body.stylesheetUploaded).toBe(true);

        const getRes = await request(server).get("/api/settings/stylesheet");
        expect(getRes.status).toBe(200);
        expect(getRes.headers["content-type"]).toBe("text/css");
        expect(getRes.text).toBe(css);

        const deleteRes = await adminAgent.delete("/api/settings/stylesheet");
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.stylesheetUploaded).toBe(false);

        const missingRes = await request(server).get("/api/settings/stylesheet");
        expect(missingRes.status).toBe(404);
    });

    it("rejects an oversized stylesheet upload", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-css-too-big");
        const big = "a".repeat(512 * 1024 + 1);

        const res = await adminAgent.post("/api/settings/stylesheet").set("Content-Type", "text/css").send(big);

        expect(res.status).toBe(413);
    });
});
