///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Mongo twin of `RegistrationDisabled.sql.test.ts`, against the real server wiring in `src/mongo`: the
// `auth:allowRegistration` config seeds the stored `SystemSettings`, an admin toggles it at runtime through
// `PUT /api/settings` (the dedicated registration/MFA policy route — see `SettingsRoute.mongo.test.ts` for
// fuller coverage of that route itself), and every path that can create a `User` honors the current value
// without a restart — direct creation (`/api/users`), OTP self-registration (`/api/register`) and a
// first-time sign-in through each OAuth provider route (Google, Apple, Facebook, Microsoft).
//
// A provider sign-in needs a real third-party code exchange, so the provider routes are exercised at the point
// where the exchange hands off to this app: the `getUser()` callback each route registers on its strategy.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { Logger, MessagingUtils } from "@rapidrest/core";
import { AuthMiddleware, ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { AliasType, importArgon2, normalizePasswordSubmission, PasswordConfig, SecretType } from "@rapidrest/auth";
import { AliasMongo, ProfileMongo, SecretMongo, SystemSettingsMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";

const PASSWORD = "S3cret!Pass123";
const OAUTH_PROVIDERS = ["google", "apple", "facebook", "microsoft"];

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-registration-disabled-test",
    },
});

describe("Registration disabled (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });
    let adminAgent: ReturnType<typeof agent>;
    let messagingUtils: MessagingUtils;
    let userRepo: RepoUtils<UserMongo>;
    let aliasRepo: RepoUtils<AliasMongo>;
    let profileRepo: RepoUtils<ProfileMongo>;
    let seeded: { stored?: boolean | null; exposed?: boolean };

    /** Provisions a password account and signs `testAgent` in as it (see `SiteSettingsRoute.mongo.test.ts`). */
    async function createAndSignInUser(
        testAgent: ReturnType<typeof agent>,
        username: string,
        roles: string[] = [],
    ): Promise<string> {
        const secretRepo: RepoUtils<SecretMongo> = await objectFactory.newInstance(RepoUtils, {
            name: "SecretMongo",
            args: [SecretMongo],
        });

        const user = await userRepo.create({ roles, scopes: [], verified: true }, { ignoreACL: true });
        await aliasRepo.create({ alias: username, type: "name", userUid: user.uid, verified: true } as any, {
            ignoreACL: true,
        });
        const argon = await importArgon2();
        const normalized = await normalizePasswordSubmission(PASSWORD, user.uid, new PasswordConfig());
        await secretRepo.create(
            { type: SecretType.PASSWORD, data: await argon.hash(normalized), userUid: user.uid },
            { ignoreACL: true },
        );

        const signInRes = await testAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (signInRes.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${signInRes.status} ${JSON.stringify(signInRes.body)}`);
        }
        return user.uid;
    }

    /** Opens or closes registration the way the admin console does. */
    async function setAllowRegistration(value: boolean): Promise<void> {
        const res = await adminAgent.put("/api/settings").send({ allowRegistration: value });
        expect(res.status).toBe(200);
    }

    /** The `getUser()` callback the given provider route registered, i.e. what runs after a successful exchange. */
    function oauthGetUser(provider: string): (token: string, profile: any) => Promise<any> {
        const authMiddleware: any = objectFactory.getInstance(AuthMiddleware);
        const options = authMiddleware.getStrategy(provider).options;
        return options.getUser.bind(options);
    }

    async function countUsers(): Promise<number> {
        return (await userRepo.find({}, { ignoreACL: true })).length;
    }

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        // Start closed by configuration, so the stored settings are seeded as closed.
        config.set("auth:allowRegistration", false);
        await server.start();

        messagingUtils = objectFactory.getInstance(MessagingUtils) as MessagingUtils;
        userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserMongo", args: [UserMongo] });
        aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasMongo", args: [AliasMongo] });
        profileRepo = await objectFactory.newInstance(RepoUtils, { name: "ProfileMongo", args: [ProfileMongo] });

        adminAgent = agent(server);
        // Runs before any HTTP call is made (see below): `DefaultAccountsMongo`'s own startup seeding job is
        // still writing via direct repo calls at this point, same as this helper — the very first *HTTP*
        // request is deliberately deferred until after it settles (see the SQL twin's own note on this).
        await createAndSignInUser(adminAgent, "registration-admin", ["admin"]);
        const elevated = await adminAgent.post("/api/auth/elevation").send({ password: PASSWORD });
        expect(elevated.status).toBe(200);

        // Read before anything writes the setting, so these reflect what was seeded from the configuration.
        const systemSettingsRepo: RepoUtils<SystemSettingsMongo> = await objectFactory.newInstance(RepoUtils, {
            name: SystemSettingsMongo.name,
            args: [SystemSettingsMongo],
        });
        const exposed = (await request(server).get("/api/settings")).body.allowRegistration;
        seeded = {
            stored: (await systemSettingsRepo.findOne("default", { ignoreACL: true }))?.allowRegistration,
            exposed,
        };
    });

    afterAll(async () => {
        config.set("auth:allowRegistration", true);
        await server.stop();
        await mongod.stop();
    });

    beforeEach(async () => {
        vi.spyOn(messagingUtils, "sendEmail").mockResolvedValue(undefined as any);
        vi.spyOn(messagingUtils, "sendSMS").mockResolvedValue(undefined as any);
        await setAllowRegistration(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("settings", () => {
        it("seeds the stored setting from the configuration and exposes it publicly", async () => {
            expect(seeded).toEqual({ stored: false, exposed: false });
        });

        it("lets an admin reopen registration at runtime", async () => {
            const opened = await adminAgent.put("/api/settings").send({ allowRegistration: true });
            expect(opened.status).toBe(200);
            expect(opened.body.allowRegistration).toBe(true);
            expect((await request(server).get("/api/settings")).body.allowRegistration).toBe(true);
        });

        // Unlike the site-branding settings this replaced, SystemSettings never reverts to @Config once
        // seeded — `null` is rejected outright rather than treated as "clear this field".
        it.each([null, "yes"])("rejects a non-boolean value (%p), leaving the stored value unchanged", async (value) => {
            const res = await adminAgent.put("/api/settings").send({ allowRegistration: value });

            expect(res.status).toBe(400);
            expect((await request(server).get("/api/settings")).body.allowRegistration).toBe(false);
        });

        it("only lets an elevated admin change the setting", async () => {
            const plainAgent = agent(server);
            await createAndSignInUser(plainAgent, "registration-plain-user");
            expect((await plainAgent.put("/api/settings").send({ allowRegistration: true })).status).toBe(403);
            expect((await request(server).put("/api/settings").send({ allowRegistration: true })).status).toBe(401);
            expect((await request(server).get("/api/settings")).body.allowRegistration).toBe(false);
        });
    });

    describe("POST /api/users", () => {
        it("rejects an anonymous caller without creating a user", async () => {
            const before = await countUsers();

            const res = await request(server).post("/api/users").send({ roles: [], scopes: [] });

            expect(res.status).toBe(403);
            expect(await countUsers()).toBe(before);
        });

        it("rejects a signed-in non-admin without creating a user", async () => {
            const plainAgent = agent(server);
            await createAndSignInUser(plainAgent, "registration-users-plain");
            const before = await countUsers();

            const res = await plainAgent.post("/api/users").send({ roles: [], scopes: [] });

            expect(res.status).toBe(403);
            expect(await countUsers()).toBe(before);
        });

        it("still lets an admin create a user", async () => {
            const before = await countUsers();

            const res = await adminAgent.post("/api/users").send({ roles: [], scopes: [], verified: true });

            expect(res.status).toBe(200);
            expect(await countUsers()).toBe(before + 1);
        });
    });

    describe("POST /api/register", () => {
        it.each([{ email: "closed@example.com" }, { phone: "+14155552671" }])(
            "rejects starting registration for %o without sending a code",
            async (body) => {
                const res = await request(server).post("/api/register/start").send(body);

                expect(res.status).toBe(403);
                expect(messagingUtils.sendEmail).not.toHaveBeenCalled();
                expect(messagingUtils.sendSMS).not.toHaveBeenCalled();
            },
        );

        it("rejects completing a registration started before it was closed, and accepts it once reopened", async () => {
            const client = agent(server);
            const email = "started-before-close@example.com";

            await setAllowRegistration(true);
            expect((await client.post("/api/register/start").send({ email })).status).toBe(200);
            const token: string = (messagingUtils.sendEmail as any).mock.calls[0][1].totp;
            await setAllowRegistration(false);
            const before = await countUsers();

            const rejected = await client.post("/api/register/verify").send({ email, token });

            expect(rejected.status).toBe(403);
            expect(await countUsers()).toBe(before);
            expect(await aliasRepo.findOne(email, { ignoreACL: true })).toBeUndefined();

            await setAllowRegistration(true);
            const accepted = await client.post("/api/register/verify").send({ email, token });

            expect(accepted.status).toBe(200);
            expect(await countUsers()).toBe(before + 1);
        });
    });

    describe.each(OAUTH_PROVIDERS)("%s sign-in", (provider) => {
        const profileFor = (id: string) => ({
            id,
            provider,
            email: `${provider}-${id}@example.com`,
            email_verified: true,
            givenName: "New",
            familyName: "User",
        });

        it("rejects a first-time sign-in without provisioning a user, profile or alias", async () => {
            const before = await countUsers();
            const profile = profileFor("first-time");

            await expect(oauthGetUser(provider)("token", profile)).rejects.toMatchObject({ status: 403 });

            expect(await countUsers()).toBe(before);
            expect(await aliasRepo.findOne(profile.email, { ignoreACL: true })).toBeUndefined();
            expect(await aliasRepo.findOne(`${provider}:first-time`, { ignoreACL: true })).toBeUndefined();
        });

        it("still signs in an existing account", async () => {
            const existing = await userRepo.create({ roles: [], scopes: [], verified: true }, { ignoreACL: true });
            await aliasRepo.create(
                { alias: `${provider}:returning`, type: AliasType.OAUTH, userUid: existing.uid, verified: true },
                { ignoreACL: true },
            );

            const user = await oauthGetUser(provider)("token", profileFor("returning"));

            expect(user.uid).toBe(existing.uid);
        });

        it("provisions the account once registration is reopened at runtime", async () => {
            const profile = profileFor("reopened");
            await expect(oauthGetUser(provider)("token", profile)).rejects.toMatchObject({ status: 403 });

            await setAllowRegistration(true);
            const before = await countUsers();
            const user = await oauthGetUser(provider)("token", profile);

            expect(await countUsers()).toBe(before + 1);
            expect(await profileRepo.findOne(user.uid, { ignoreACL: true })).toBeDefined();
        });
    });
});
