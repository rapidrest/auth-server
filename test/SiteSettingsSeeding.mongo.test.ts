///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end coverage of the `site_settings` config seeding the branding row (see `getOrCreateSiteSettings()`),
// against a real (if lightweight) running server: what the unit tests in `BaseSiteSettingsRoute.test.ts` prove
// against a fake repository is proved here against the real column/round trip — the `seeded` column exists, config
// seeds it once at startup, an admin's edit (including clearing a field) sticks, and a row saved before seeding
// existed (`seeded` unset) is only filled where it's empty. See `SiteSettingsRoute.mongo.test.ts` for the shared
// bootstrap pattern this mirrors — this is its Mongo twin of `SiteSettingsSeeding.sql.test.ts`.
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
import { SiteSettingsMongo } from "../src/models/mongo/SiteSettingsMongo.js";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-site-settings-seeding-test",
    },
});

const PASSWORD = "S3cret!Pass123";

/** What a downstream app such as RapidMX would set at deployment (`site_settings__siteTitle`, ...), with two entries that are refused. */
const CONFIGURED = {
    siteTitle: "RapidMX",
    companyName: "RapidMX Inc",
    headerHtml: "<b>RapidMX</b>",
    logoUrl: "https://cdn.rapidmx.test/logo.svg",
    iconUrl: "",
    stylesheetUrl: "javascript:alert(1)",
};

describe("site settings seeded from config (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    async function settingsRepo(): Promise<RepoUtils<SiteSettingsMongo>> {
        return objectFactory.newInstance(RepoUtils, { name: "SiteSettingsMongo", args: [SiteSettingsMongo] });
    }

    async function createSignedInTrustedAgent(username: string): Promise<ReturnType<typeof agent>> {
        const userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserMongo", args: [UserMongo] });
        const aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasMongo", args: [AliasMongo] });
        const secretRepo = await objectFactory.newInstance(RepoUtils, { name: "SecretMongo", args: [SecretMongo] });

        const user = await userRepo.create({ roles: ["admin"], scopes: [], verified: true }, { ignoreACL: true });
        await aliasRepo.create({ alias: username, type: "name", userUid: user.uid, verified: true }, { ignoreACL: true });
        const argon = await importArgon2();
        const normalized = await normalizePasswordSubmission(PASSWORD, user.uid, new PasswordConfig());
        await secretRepo.create(
            { type: "password", data: await argon.hash(normalized), userUid: user.uid },
            { ignoreACL: true },
        );

        const trustedAgent = agent(server);
        const signInRes = await trustedAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (signInRes.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${signInRes.status} ${JSON.stringify(signInRes.body)}`);
        }
        // Only an elevated session carries the trusted `admin` role — see SiteSettingsRoute.sql.test.ts.
        const elevateRes = await trustedAgent.post("/api/auth/elevation").send({ password: PASSWORD });
        if (elevateRes.status !== 200) {
            throw new Error(`Elevation failed for test setup: ${elevateRes.status} ${JSON.stringify(elevateRes.body)}`);
        }
        return trustedAgent;
    }

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        config.set("site_settings", CONFIGURED);
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
        config.set("site_settings", undefined);
    });

    it("seeded the row as the server started, skipping the blank and the invalid values", async () => {
        const row = await (await settingsRepo()).findOne("default", { ignoreACL: true });

        expect(row).toMatchObject({
            seeded: true,
            siteTitle: "RapidMX",
            companyName: "RapidMX Inc",
            headerHtml: "<b>RapidMX</b>",
            logoUrl: "https://cdn.rapidmx.test/logo.svg",
        });
        expect(row?.iconUrl).toBeFalsy();
        expect(row?.stylesheetUrl).toBeFalsy();
    });

    it("serves the seeded branding publicly, never exposing the seeded marker", async () => {
        const res = await request(server).get("/api/settings/branding");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            siteTitle: "RapidMX",
            companyName: "RapidMX Inc",
            headerHtml: "<b>RapidMX</b>",
            logoUrl: "https://cdn.rapidmx.test/logo.svg",
            logoUploaded: false,
            iconUploaded: false,
            stylesheetUploaded: false,
        });
    });

    it("keeps an admin's changes, including a cleared field, rather than seeding config over them again", async () => {
        const adminAgent = await createSignedInTrustedAgent("admin-seeding-1");

        const put = await adminAgent
            .put("/api/settings/branding")
            .send({ siteTitle: "Our Own Brand", companyName: null, logoUrl: null });
        expect(put.status).toBe(200);

        const res = await request(server).get("/api/settings/branding");
        expect(res.body.siteTitle).toBe("Our Own Brand");
        expect(res.body.companyName).toBeUndefined();
        expect(res.body.logoUrl).toBeUndefined();
        expect(res.body.headerHtml).toBe("<b>RapidMX</b>");
        expect((await (await settingsRepo()).findOne("default", { ignoreACL: true }))?.seeded).toBe(true);
    });

    it("fills only the empty fields of a row saved before seeding existed, keeping what's already there", async () => {
        const repo = await settingsRepo();
        const row = (await repo.findOne("default", { ignoreACL: true }))!;
        // What a deployment upgraded from a version without seeding looks like: an admin's values, and `seeded` unset.
        await repo.update(
            new SiteSettingsMongo({
                ...row,
                siteTitle: "Admin's Title",
                companyName: null as any,
                headerHtml: "<i>Admin's header</i>",
                logoUrl: null as any,
                seeded: null as any,
            }),
            row,
            { ignoreACL: true },
        );

        const res = await request(server).get("/api/settings/branding");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            siteTitle: "Admin's Title",
            headerHtml: "<i>Admin's header</i>",
            companyName: "RapidMX Inc",
            logoUrl: "https://cdn.rapidmx.test/logo.svg",
        });
        expect((await repo.findOne("default", { ignoreACL: true }))?.seeded).toBe(true);
    });
});
