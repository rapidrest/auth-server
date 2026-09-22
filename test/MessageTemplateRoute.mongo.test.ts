///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end coverage of database-backed message templates, SMS (Twilio or Telnyx) and WhatsApp credentials against a real (if lightweight)
// running server: the admin API, the storage behind it, and — the part unit tests can't show — that the
// `MessagingUtils` every `@rapidrest/auth` route was handed really is the database-backed one, so an edit made
// through the API is what the next real send renders. Only the SMTP transport, the Twilio client and the HTTP request Telnyx and WhatsApp are sent with are faked. See
// `BaseDatabaseMessagingUtils.test.ts` for the same logic against fake repositories, which is where the failure
// paths are covered. This is the Mongo twin of `MessageTemplateRoute.sql.test.ts`, generated from it, matching this app's convention of
// mirroring every feature across both datastores.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.mongo.js";
import { Logger, MessagingUtils } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { importArgon2, normalizePasswordSubmission, PasswordConfig } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";
import { BaseDatabaseMessagingUtils } from "../src/messaging/BaseDatabaseMessagingUtils.js";
import { decryptSecret } from "../src/messaging/SecretBox.js";
import { MessagingSettingsMongo } from "../src/models/mongo/MessagingSettingsMongo.js";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-message-templates-test",
    },
});
const PASSWORD = "S3cret!Pass123";
const SID = "AC" + "0123456789abcdef".repeat(2);
const OTHER_SID = "AC" + "fedcba9876543210".repeat(2);
const ENCRYPTION_KEY = "96aa4879e304e525b74141bf1bc072c17e2b90c5b35250a2d18cbd2b8d4172ac";
const TEMPLATE_NAMES = ["login-otp", "register-otp", "verify-contact-otp"];
// What the deployment's config says, which seeds the database the first time it's read.
const CONFIG_TWILIO = { accountSid: SID, token: "config-token" };
const CONFIG_SMS = { provider: "twilio", config: CONFIG_TWILIO };
const CONFIG_WHATSAPP = { accessToken: "config-wa-token", phoneNumberId: "109876543210", apiVersion: "v22.0" };
const OTHER_PHONE_NUMBER_ID = "555000111222";
const PROFILE_ID = "40017a5c-2d1f-4d4e-9d0a-6a3f2d1b9c11";
const CONFIG_SMTP = { host: "smtp.config.test", port: 587, secure: false, auth: { user: "config-user", pass: "config-pass" }, tls: { minVersion: "TLSv1.2" } };
const CONFIG_FROM = { email: "no-reply@acme.test", sms: "+15555550100" };

describe("Message templates (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    let adminAgent: ReturnType<typeof agent>;
    let messaging: any;
    let sendMail: ReturnType<typeof vi.fn>;
    let smsCreate: ReturnType<typeof vi.fn>;
    let smtpBuild: ReturnType<typeof vi.spyOn>;
    let twilioBuild: ReturnType<typeof vi.spyOn>;
    let postJson: ReturnType<typeof vi.spyOn>;

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

    /** Sends one of the server's real e-mails the way a route does, and returns what reached the (fake) SMTP transport. */
    async function sendLoginEmail(totp = "482913"): Promise<any> {
        sendMail.mockClear();
        await messaging.sendEmail("login-otp", { totp }, { to: "user@acme.test" });
        return sendMail.mock.calls[0][0];
    }

    beforeAll(async () => {
        await mongod.start();
        config.set("rateLimit", { enabled: false });
        config.set("templates:from:email", CONFIG_FROM.email);
        config.set("templates:from:sms", CONFIG_FROM.sms);
        config.set("smtp_config", CONFIG_SMTP);
        config.set("sms_config", CONFIG_SMS);
        config.set("whatsapp", CONFIG_WHATSAPP);
        config.set("auth:oauth_server:keys:encryption_key", ENCRYPTION_KEY);
        await server.start();

        messaging = objectFactory.getInstance(MessagingUtils);
        sendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
        smsCreate = vi.fn().mockResolvedValue({ sid: "SM1" });
        // Wherever the server builds a transport or client from what's in effect, hand back the same fakes.
        smtpBuild = vi.spyOn(messaging, "createSmtpTransport").mockImplementation(async () => ({ sendMail }));
        twilioBuild = vi.spyOn(messaging, "createTwilioClient").mockImplementation(async () => ({ messages: { create: smsCreate } }));
        // ...and for what goes over HTTP: a Telnyx text, or a WhatsApp message.
        postJson = vi.spyOn(messaging, "postJson").mockResolvedValue({ data: { id: "telnyx-1" }, messages: [{ id: "wamid.1" }] });

        adminAgent = await createSignedInTrustedAgent("admin-templates");
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    beforeEach(async () => {
        // Every test starts from unedited templates and no branding, whatever the one before it did.
        for (const name of TEMPLATE_NAMES) {
            await adminAgent.delete(`/api/settings/messages/${name}`);
        }
        await adminAgent.put("/api/settings/branding").send({ companyName: null, siteTitle: null, logoUrl: null });
        // ...and from the settings the deployment's config seeded, with the fakes standing in for the transports
        // that would have been built from them at startup.
        await adminAgent.put("/api/settings/smtp").send({
            host: CONFIG_SMTP.host,
            port: CONFIG_SMTP.port,
            secure: CONFIG_SMTP.secure,
            user: CONFIG_SMTP.auth.user,
            password: CONFIG_SMTP.auth.pass,
            from: CONFIG_FROM.email,
        });
        await adminAgent.put("/api/settings/sms").send({
            provider: CONFIG_SMS.provider,
            twilio: { accountSid: CONFIG_TWILIO.accountSid, token: CONFIG_TWILIO.token },
            telnyx: { apiKey: null, messagingProfileId: null },
            from: CONFIG_FROM.sms,
        });
        await adminAgent.put("/api/settings/whatsapp").send({
            phoneNumberId: CONFIG_WHATSAPP.phoneNumberId,
            accessToken: CONFIG_WHATSAPP.accessToken,
            apiVersion: CONFIG_WHATSAPP.apiVersion,
        });
        messaging.smtpKey = undefined;
        messaging.smsKey = undefined;
        messaging.smtpConfig = CONFIG_SMTP;
        messaging._transporter = { sendMail };
        messaging.smsConfig = CONFIG_SMS;
        messaging.twilio = { messages: { create: smsCreate } };
        messaging.telnyx = undefined;
        messaging.whatsapp = CONFIG_WHATSAPP;
        sendMail.mockClear();
        smsCreate.mockClear();
        smtpBuild.mockClear();
        twilioBuild.mockClear();
        postJson.mockClear();
    });

    describe("the database-backed MessagingUtils", () => {
        it("is what the server runs, not the stock class", () => {
            expect(messaging).toBeInstanceOf(BaseDatabaseMessagingUtils);
        });

        it("is the very instance every route that sends messages was handed", () => {
            const holders = [...objectFactory.instances.values()].filter(
                (instance) => instance && Object.prototype.hasOwnProperty.call(instance, "messagingUtils"),
            );

            expect(holders.length).toBeGreaterThan(0);
            for (const holder of holders) {
                expect(holder.messagingUtils).toBe(messaging);
            }
        });
    });

    describe("access", () => {
        it("refuses an anonymous caller everywhere", async () => {
            expect((await request(server).get("/api/settings/messages")).status).toBe(401);
            expect((await request(server).get("/api/settings/messages/login-otp")).status).toBe(401);
            expect((await request(server).put("/api/settings/messages/login-otp").send({})).status).toBe(401);
            expect((await request(server).delete("/api/settings/messages/login-otp")).status).toBe(401);
            expect((await request(server).post("/api/settings/messages/login-otp/preview").send({})).status).toBe(401);
            expect((await request(server).get("/api/settings/sms")).status).toBe(401);
            expect((await request(server).put("/api/settings/sms").send({})).status).toBe(401);
            expect((await request(server).get("/api/settings/whatsapp")).status).toBe(401);
            expect((await request(server).put("/api/settings/whatsapp").send({})).status).toBe(401);
            expect((await request(server).get("/api/settings/smtp")).status).toBe(401);
            expect((await request(server).put("/api/settings/smtp").send({})).status).toBe(401);
            expect((await request(server).post("/api/settings/sms/reset")).status).toBe(401);
            expect((await request(server).post("/api/settings/whatsapp/reset")).status).toBe(401);
            expect((await request(server).post("/api/settings/smtp/reset")).status).toBe(401);
        });

        it("refuses a signed-in caller without the trusted 'admin' role, reads included", async () => {
            const plain = agent(server);
            await createAndSignInUser(plain, "plain-templates-user");

            expect((await plain.get("/api/settings/messages")).status).toBe(403);
            expect((await plain.get("/api/settings/messages/login-otp")).status).toBe(403);
            expect((await plain.put("/api/settings/messages/login-otp").send({ subject: "x" })).status).toBe(403);
            expect((await plain.get("/api/settings/sms")).status).toBe(403);
            expect((await plain.put("/api/settings/sms").send({ twilio: { accountSid: SID } })).status).toBe(403);
            expect((await plain.get("/api/settings/whatsapp")).status).toBe(403);
            expect((await plain.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID })).status).toBe(403);
            expect((await plain.get("/api/settings/smtp")).status).toBe(403);
            expect((await plain.put("/api/settings/smtp").send({ host: "smtp.evil.test" })).status).toBe(403);
            expect((await plain.post("/api/settings/sms/reset")).status).toBe(403);
            expect((await plain.post("/api/settings/whatsapp/reset")).status).toBe(403);
            expect((await plain.post("/api/settings/smtp/reset")).status).toBe(403);
        });

        it("refuses a trusted-role caller who hasn't elevated", async () => {
            const notElevated = agent(server);
            await createAndSignInUser(notElevated, "admin-templates-not-elevated", ["admin"]);

            expect((await notElevated.get("/api/settings/messages")).status).toBe(403);
            expect((await notElevated.get("/api/settings/sms")).status).toBe(403);
            expect((await notElevated.put("/api/settings/sms").send({ twilio: { accountSid: SID } })).status).toBe(403);
            expect((await notElevated.post("/api/settings/sms/reset")).status).toBe(403);
            expect((await notElevated.get("/api/settings/whatsapp")).status).toBe(403);
            expect((await notElevated.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID })).status).toBe(403);
            expect((await notElevated.post("/api/settings/whatsapp/reset")).status).toBe(403);
            expect((await notElevated.put("/api/settings/smtp").send({ host: "smtp.evil.test" })).status).toBe(403);
        });
    });

    describe("reading", () => {
        it("lists every template the server sends, none of them edited", async () => {
            const res = await adminAgent.get("/api/settings/messages");

            expect(res.status).toBe(200);
            expect(res.body.map((t: any) => t.name).sort()).toEqual(TEMPLATE_NAMES);
            for (const template of res.body) {
                expect(template).toMatchObject({ customized: false, enabled: true });
                expect(template.description).toEqual(expect.any(String));
            }
        });

        it("gets a template with its defaults, which parts are edited, and the variables it can use", async () => {
            const res = await adminAgent.get("/api/settings/messages/login-otp");

            expect(res.status).toBe(200);
            expect(res.body.subject).toBe(res.body.defaults.subject);
            expect(res.body.html).toContain("{{brand.logoUrl}}");
            expect(res.body.text).toContain("{{{brand.name}}}");
            expect(res.body.overridden).toEqual({
                enabled: false,
                subject: false,
                text: false,
                html: false,
                sms: false,
                whatsapp: false,
                whatsappTemplateName: false,
                whatsappTemplateLanguage: false,
                whatsappTemplateParameters: false,
            });
            // Shipped with a free-form WhatsApp message, and no approved message template (its name is the deployment's to choose).
            expect(res.body.whatsapp).toContain("{{{brand.name}}}");
            expect(res.body.whatsapp).toContain("{{totp}}");
            expect(res.body.whatsappTemplateName).toBeUndefined();
            expect(res.body.variables.map((v: any) => v.name)).toEqual(expect.arrayContaining(["totp", "brand.name", "brand.logoUrl"]));
        });

        it("404s for a name that isn't a template, and for the sender settings", async () => {
            expect((await adminAgent.get("/api/settings/messages/no-such-template")).status).toBe(404);
            expect((await adminAgent.get("/api/settings/messages/from")).status).toBe(404);
            expect((await adminAgent.put("/api/settings/messages/no-such-template").send({ subject: "x" })).status).toBe(404);
            expect((await adminAgent.delete("/api/settings/messages/no-such-template")).status).toBe(404);
            expect((await adminAgent.post("/api/settings/messages/no-such-template/preview").send({})).status).toBe(404);
        });
    });

    describe("editing", () => {
        it("saves an edit, which the very next real send uses", async () => {
            const before = await sendLoginEmail();
            expect(before.subject).toBe("Your RapidREST sign-in verification code");

            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ subject: "Edited: {{totp}}" });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ customized: true, subject: "Edited: {{totp}}" });
            expect(res.body.overridden).toMatchObject({ subject: true, text: false, html: false, sms: false, whatsapp: false });
            const after = await sendLoginEmail("777111");
            expect(after.subject).toBe("Edited: 777111");
            // The parts that weren't touched still follow the default.
            expect(after.text).toContain("777111");
        });

        it("reads the edit back, and it survives a fresh read", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ sms: "Code {{totp}}" });

            const detail = await adminAgent.get("/api/settings/messages/login-otp");
            const list = await adminAgent.get("/api/settings/messages");

            expect(detail.body).toMatchObject({ customized: true, sms: "Code {{totp}}" });
            expect(list.body.find((t: any) => t.name === "login-otp").customized).toBe(true);
            expect(list.body.find((t: any) => t.name === "register-otp").customized).toBe(false);
        });

        it("edits each part independently, adding to what's already saved", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ subject: "S {{totp}}" });
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ text: "T {{totp}}" });

            expect(res.body.overridden).toMatchObject({ subject: true, text: true, html: false });
            const email = await sendLoginEmail("5");
            expect(email.subject).toBe("S 5");
            expect(email.text).toBe("T 5");
        });

        it("stores a part that matches the default as not edited, so the template isn't customized", async () => {
            const { body: detail } = await adminAgent.get("/api/settings/messages/login-otp");

            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ subject: detail.defaults.subject });

            expect(res.status).toBe(200);
            expect(res.body.customized).toBe(false);
        });

        it("clears a part with null, and the template stops being customized when nothing is left", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ subject: "Edited" });

            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ subject: null });

            expect(res.body.customized).toBe(false);
            expect((await sendLoginEmail()).subject).toBe("Your RapidREST sign-in verification code");
        });

        it("can turn a template off, and back on", async () => {
            const off = await adminAgent.put("/api/settings/messages/login-otp").send({ enabled: false });
            expect(off.body).toMatchObject({ enabled: false, customized: true });
            sendMail.mockClear();
            await messaging.sendEmail("login-otp", { totp: "1" }, { to: "user@acme.test" });
            expect(sendMail).not.toHaveBeenCalled();

            const on = await adminAgent.put("/api/settings/messages/login-otp").send({ enabled: true });
            expect(on.body).toMatchObject({ enabled: true, customized: false });
            expect((await sendLoginEmail()).subject).toBeDefined();
        });

        it("sends plain text only when the html part is emptied", async () => {
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ html: "" });

            expect(res.body).toMatchObject({ customized: true, html: "" });
            const email = await sendLoginEmail("9");
            expect(email.html).toBeNull();
            expect(email.text).toContain("9");
        });

        it("keeps a long template intact", async () => {
            const html = "<p>{{totp}}</p>" + "<!-- padding -->".repeat(2000);

            await adminAgent.put("/api/settings/messages/login-otp").send({ html });

            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.html).toBe(html);
        });

        it("resets a template with DELETE, discarding every edit", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ subject: "Edited", sms: "Edited" });

            const res = await adminAgent.delete("/api/settings/messages/login-otp");

            expect(res.status).toBe(200);
            expect(res.body.customized).toBe(false);
            expect((await sendLoginEmail()).subject).toBe("Your RapidREST sign-in verification code");
        });

        it("resets a template that was never edited without complaint", async () => {
            expect((await adminAgent.delete("/api/settings/messages/register-otp")).status).toBe(200);
        });

        it("saves an edited WhatsApp message, which the very next real send uses", async () => {
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ whatsapp: "Your code: {{totp}}" });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ customized: true, whatsapp: "Your code: {{totp}}" });
            expect(res.body.overridden).toMatchObject({ whatsapp: true, sms: false });
            await messaging.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

            expect(postJson.mock.calls[0][3]).toMatchObject({ type: "text", to: "15555550123", text: { body: "Your code: 482913" } });
        });

        it("saves an approved WhatsApp message template, which the very next real send uses instead of the message", async () => {
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                customized: true,
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });
            expect(res.body.overridden).toMatchObject({ whatsappTemplateName: true, whatsappTemplateLanguage: true, whatsappTemplateParameters: true, whatsapp: false });
            await messaging.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

            expect(postJson.mock.calls[0][3]).toMatchObject({
                type: "template",
                template: {
                    name: "login_code",
                    language: { code: "en_US" },
                    components: [{ type: "body", parameters: [{ type: "text", text: "482913" }, { type: "text", text: "RapidREST" }] }],
                },
            });
        });

        it("reads the WhatsApp template back after a fresh read, its parameters one per line", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });

            const detail = await adminAgent.get("/api/settings/messages/login-otp");

            expect(detail.body).toMatchObject({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });
            expect(detail.body.defaults.whatsappTemplateName).toBeUndefined();
        });

        it("edits the WhatsApp template's parts independently, adding to what's already saved", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateName: "login_code", whatsappTemplateLanguage: "en_US" });
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateLanguage: "fr" });

            expect(res.body).toMatchObject({ whatsappTemplateName: "login_code", whatsappTemplateLanguage: "fr" });
            expect(res.body.overridden).toMatchObject({ whatsappTemplateName: true, whatsappTemplateLanguage: true, whatsappTemplateParameters: false });
        });

        it("goes back to the free-form message once the template name is cleared with null", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateName: "login_code", whatsappTemplateLanguage: "en_US" });

            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateName: null, whatsappTemplateLanguage: null });

            expect(res.body.customized).toBe(false);
            await messaging.sendWhatsApp("login-otp", { totp: "1" }, { to: "15555550123" });
            expect(postJson.mock.calls[0][3]).toMatchObject({ type: "text" });
        });

        it("refuses a WhatsApp message template with no language, saving nothing", async () => {
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateName: "login_code" });

            expect(res.status).toBe(400);
            expect(res.body.message ?? JSON.stringify(res.body)).toContain("needs the language it was approved in");
            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.customized).toBe(false);
        });

        it("refuses a WhatsApp message that doesn't render, values of the wrong type, and one that's too large", async () => {
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ whatsapp: "{{totp" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ whatsapp: 7 })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateName: false })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ whatsappTemplateParameters: "x".repeat(100_001) })).status).toBe(413);
            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.customized).toBe(false);
        });

        it("resets a template's WhatsApp edits too, with DELETE", async () => {
            await adminAgent.put("/api/settings/messages/login-otp").send({ whatsapp: "Edited", whatsappTemplateName: "login_code", whatsappTemplateLanguage: "en_US" });

            const res = await adminAgent.delete("/api/settings/messages/login-otp");

            expect(res.body.customized).toBe(false);
            expect(res.body.whatsappTemplateName).toBeUndefined();
            expect(res.body.whatsapp).toContain("{{totp}}");
        });

        it("stores a WhatsApp part that matches the default as not edited, so the template isn't customized", async () => {
            const { body: detail } = await adminAgent.get("/api/settings/messages/login-otp");

            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ whatsapp: detail.defaults.whatsapp });

            expect(res.status).toBe(200);
            expect(res.body.customized).toBe(false);
        });

        it("refuses a template that doesn't render, saving nothing", async () => {
            const res = await adminAgent.put("/api/settings/messages/login-otp").send({ text: "{{#if totp}}never closed" });

            expect(res.status).toBe(400);
            expect(res.body.message ?? JSON.stringify(res.body)).toContain("can't be rendered");
            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.customized).toBe(false);
            expect((await sendLoginEmail()).subject).toBe("Your RapidREST sign-in verification code");
        });

        it("refuses values of the wrong type, and one that's too large", async () => {
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ enabled: "yes" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ subject: 7 })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/messages/login-otp").send({ html: "x".repeat(100_001) })).status).toBe(413);
        });
    });

    describe("branding", () => {
        it("fills the site's company name into a real send: unescaped in text, escaped in HTML", async () => {
            await adminAgent.put("/api/settings/branding").send({ companyName: "Tom & Jerry" });

            const email = await sendLoginEmail("1");

            expect(email.subject).toBe("Your Tom & Jerry sign-in verification code");
            expect(email.text).toContain("Tom & Jerry");
            expect(email.text).not.toContain("&amp;");
            expect(email.html).toContain("Tom &amp; Jerry");
        });

        it("falls back to the site title, then to the stock name", async () => {
            await adminAgent.put("/api/settings/branding").send({ siteTitle: "Portal" });
            expect((await sendLoginEmail()).subject).toBe("Your Portal sign-in verification code");

            await adminAgent.put("/api/settings/branding").send({ siteTitle: null });
            expect((await sendLoginEmail()).subject).toBe("Your RapidREST sign-in verification code");
        });

        it("shows the configured logo, as an absolute address, in the HTML", async () => {
            await adminAgent.put("/api/settings/branding").send({ companyName: "Acme", logoUrl: "https://cdn.acme.test/logo.png" });

            const email = await sendLoginEmail();

            expect(email.html).toContain('<img src="https://cdn.acme.test/logo.png" alt="Acme"');
        });

        it("shows the name instead when there's no logo", async () => {
            await adminAgent.put("/api/settings/branding").send({ companyName: "Acme" });

            const email = await sendLoginEmail();

            expect(email.html).not.toContain("<img");
            expect(email.html).toContain(">Acme</span>");
        });

        it("makes a relative logo path absolute against this server's public address", async () => {
            await adminAgent.put("/api/settings/branding").send({ logoUrl: "/images/logo.png" });

            const email = await sendLoginEmail();

            expect(email.html).toContain('src="http://localhost:3001/images/logo.png"');
        });

        it("uses the branding in an SMS as well", async () => {
            await adminAgent.put("/api/settings/branding").send({ companyName: "Acme" });

            await messaging.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" });

            expect(smsCreate).toHaveBeenCalledWith(
                expect.objectContaining({ from: "+15555550100", body: expect.stringMatching(/^Acme: .*482913/) }),
            );
        });
    });

    describe("previewing", () => {
        it("renders the template with the real branding and a sample code", async () => {
            await adminAgent.put("/api/settings/branding").send({ companyName: "Acme" });

            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({});

            expect(res.status).toBe(200);
            expect(res.body.subject).toBe("Your Acme sign-in verification code");
            expect(res.body.text).toContain("123456");
            expect(res.body.html).toContain("123456");
            expect(res.body.sms).toContain("123456");
            expect(res.body.whatsapp).toContain("Acme");
            expect(res.body.whatsapp).toContain("123456");
        });

        it("previews an unsaved WhatsApp message template as its name, language and parameters", async () => {
            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}",
            });

            expect(res.status).toBe(200);
            expect(res.body.whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 123456');
            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.customized).toBe(false);
        });

        it("previews an unsaved WhatsApp message as its text", async () => {
            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({ whatsapp: "Draft {{totp}}" });

            expect(res.body.whatsapp).toBe("Draft 123456");
        });

        it("previews nothing for WhatsApp when its message is emptied", async () => {
            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({ whatsapp: "" });

            expect(res.status).toBe(200);
            expect(res.body.whatsapp).toBeNull();
        });

        it("refuses a WhatsApp draft with a template name and no language, and one that doesn't render", async () => {
            expect((await adminAgent.post("/api/settings/messages/login-otp/preview").send({ whatsappTemplateName: "login_code" })).status).toBe(400);
            expect((await adminAgent.post("/api/settings/messages/login-otp/preview").send({ whatsapp: "{{totp" })).status).toBe(400);
        });

        it("previews an unsaved edit without saving it", async () => {
            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({ subject: "Draft {{totp}}" });

            expect(res.body.subject).toBe("Draft 123456");
            expect((await adminAgent.get("/api/settings/messages/login-otp")).body.customized).toBe(false);
        });

        it("refuses a draft that doesn't render", async () => {
            const res = await adminAgent.post("/api/settings/messages/login-otp/preview").send({ sms: "{{totp" });

            expect(res.status).toBe(400);
        });
    });

    describe("seeded from the deployment's config", () => {
        it("has the SMS settings config provided, without the token", async () => {
            const res = await request(server).get("/api/settings/sms");
            expect(res.status).toBe(401);

            const seeded = await adminAgent.get("/api/settings/sms");

            expect(seeded.body).toEqual({
                provider: "twilio",
                twilio: { accountSid: SID, tokenSet: true },
                telnyx: { apiKeySet: false },
                from: CONFIG_FROM.sms,
                configured: true,
            });
            expect(JSON.stringify(seeded.body)).not.toContain(CONFIG_TWILIO.token);
        });

        it("has the WhatsApp settings config provided, without the access token", async () => {
            const res = await request(server).get("/api/settings/whatsapp");
            expect(res.status).toBe(401);

            const seeded = await adminAgent.get("/api/settings/whatsapp");

            expect(seeded.body).toEqual({
                phoneNumberId: CONFIG_WHATSAPP.phoneNumberId,
                accessTokenSet: true,
                apiVersion: CONFIG_WHATSAPP.apiVersion,
                configured: true,
            });
            expect(JSON.stringify(seeded.body)).not.toContain(CONFIG_WHATSAPP.accessToken);
        });

        it("has the SMTP settings config provided, without the password", async () => {
            const seeded = await adminAgent.get("/api/settings/smtp");

            expect(seeded.body).toEqual({
                host: CONFIG_SMTP.host,
                port: CONFIG_SMTP.port,
                secure: false,
                user: CONFIG_SMTP.auth.user,
                passwordSet: true,
                from: CONFIG_FROM.email,
                configured: true,
            });
            expect(JSON.stringify(seeded.body)).not.toContain(CONFIG_SMTP.auth.pass);
        });

        it("stored the secrets encrypted, never in the clear", async () => {
            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            const row = await repo.findOne("default", { ignoreACL: true });

            expect(row!.seeded).toBe(true);
            expect(row!.twilioToken).toMatch(/^enc:v1:/);
            expect(row!.whatsappAccessToken).toMatch(/^enc:v1:/);
            expect(row!.smtpPassword).toMatch(/^enc:v1:/);
            expect(JSON.stringify(row)).not.toContain(CONFIG_TWILIO.token);
            expect(JSON.stringify(row)).not.toContain(CONFIG_WHATSAPP.accessToken);
            expect(JSON.stringify(row)).not.toContain(CONFIG_SMTP.auth.pass);
        });
    });

    describe("SMS settings", () => {
        const TO = { to: "+15555550123" };

        async function settingsRow(): Promise<any> {
            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            return repo.findOne("default", { ignoreACL: true });
        }

        it("saves the SID, token and sender, reporting the token as set without ever returning it", async () => {
            const res = await adminAgent.put("/api/settings/sms").send({ twilio: { accountSid: OTHER_SID, token: "the-auth-token" }, from: "Acme" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                provider: "twilio",
                twilio: { accountSid: OTHER_SID, tokenSet: true },
                telnyx: { apiKeySet: false },
                from: "Acme",
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain("the-auth-token");
            const read = await adminAgent.get("/api/settings/sms");
            expect(read.body).toEqual(res.body);
        });

        it("stores the token encrypted, never in the clear", async () => {
            await adminAgent.put("/api/settings/sms").send({ twilio: { token: "the-auth-token" } });

            const row = await settingsRow();

            expect(row.twilioToken).toMatch(/^enc:v1:/);
            expect(row.twilioToken).not.toContain("the-auth-token");
            expect(decryptSecret(row.twilioToken, ENCRYPTION_KEY)).toBe("the-auth-token");
        });

        it("has the next SMS use the saved credentials and sender, with no restart", async () => {
            await adminAgent.put("/api/settings/sms").send({ twilio: { accountSid: OTHER_SID, token: "the-auth-token" }, from: "Acme" });

            await messaging.sendSMS("login-otp", { totp: "482913" }, TO);

            expect(twilioBuild).toHaveBeenCalledWith({ accountSid: OTHER_SID, token: "the-auth-token", options: undefined });
            expect(smsCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "Acme", body: expect.stringContaining("482913") }));
        });

        it("uses a rotated token straight away, and builds the client once per change", async () => {
            await adminAgent.put("/api/settings/sms").send({ twilio: { token: "first-token" } });
            await messaging.sendSMS("login-otp", { totp: "1" }, TO);
            await messaging.sendSMS("login-otp", { totp: "2" }, TO);
            expect(twilioBuild).toHaveBeenCalledTimes(1);

            await adminAgent.put("/api/settings/sms").send({ twilio: { token: "second-token" } });
            await messaging.sendSMS("login-otp", { totp: "3" }, TO);

            expect(twilioBuild).toHaveBeenCalledTimes(2);
            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: SID, token: "second-token", options: undefined });
        });

        it("leaves whatever wasn't sent as it was", async () => {
            const res = await adminAgent.put("/api/settings/sms").send({ from: "+15555550111" });

            expect(res.body).toEqual({
                provider: "twilio",
                twilio: { accountSid: SID, tokenSet: true },
                telnyx: { apiKeySet: false },
                from: "+15555550111",
                configured: true,
            });
        });

        it("stops sending, without going back to config, once the credentials are cleared", async () => {
            const cleared = await adminAgent.put("/api/settings/sms").send({ twilio: { accountSid: null, token: null } });

            expect(cleared.body).toEqual({ provider: "twilio", twilio: { tokenSet: false }, telnyx: { apiKeySet: false }, from: CONFIG_FROM.sms, configured: false });
            await expect(messaging.sendSMS("login-otp", { totp: "1" }, TO)).rejects.toThrow("SMS is not configured.");
        });

        it("sends nothing, without failing the send, once the sender is cleared", async () => {
            await adminAgent.put("/api/settings/sms").send({ from: null });

            await messaging.sendSMS("login-otp", { totp: "1" }, TO);

            expect(smsCreate).not.toHaveBeenCalled();
            expect(postJson).not.toHaveBeenCalled();
        });

        it("saves Telnyx's API key and messaging profile, reporting the key as set without ever returning it", async () => {
            const res = await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: "KEY-the-telnyx-key", messagingProfileId: PROFILE_ID } });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                provider: "twilio",
                twilio: { accountSid: SID, tokenSet: true },
                telnyx: { apiKeySet: true, messagingProfileId: PROFILE_ID },
                from: CONFIG_FROM.sms,
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain("KEY-the-telnyx-key");
            expect((await adminAgent.get("/api/settings/sms")).body).toEqual(res.body);
        });

        it("stores the Telnyx API key encrypted, never in the clear", async () => {
            await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: "KEY-the-telnyx-key" } });

            const row = await settingsRow();

            expect(row.telnyxApiKey).toMatch(/^enc:v1:/);
            expect(row.telnyxApiKey).not.toContain("KEY-the-telnyx-key");
            expect(decryptSecret(row.telnyxApiKey, ENCRYPTION_KEY)).toBe("KEY-the-telnyx-key");
        });

        it("keeps sending through Twilio when only Telnyx's settings are saved, since Twilio is still the provider", async () => {
            await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: "KEY-the-telnyx-key", messagingProfileId: PROFILE_ID } });

            await messaging.sendSMS("login-otp", { totp: "1" }, TO);

            expect(smsCreate).toHaveBeenCalledTimes(1);
            expect(postJson).not.toHaveBeenCalled();
        });

        it("has the next SMS go through Telnyx, and only Telnyx, once it's chosen — with no restart", async () => {
            await adminAgent.put("/api/settings/sms").send({ provider: "telnyx", telnyx: { apiKey: "KEY-the-telnyx-key", messagingProfileId: PROFILE_ID } });

            await messaging.sendSMS("login-otp", { totp: "482913" }, TO);

            expect(smsCreate).not.toHaveBeenCalled();
            expect(postJson).toHaveBeenCalledTimes(1);
            const [provider, url, token, body] = postJson.mock.calls[0];
            expect(provider).toBe("Telnyx");
            expect(url).toBe("https://api.telnyx.com/v2/messages");
            expect(token).toBe("KEY-the-telnyx-key");
            expect(body).toMatchObject({ to: "+15555550123", from: CONFIG_FROM.sms, messaging_profile_id: PROFILE_ID, text: expect.stringContaining("482913") });
            expect(messaging.twilio).toBeUndefined();
            expect(messaging.telnyx).toEqual({ apiKey: "KEY-the-telnyx-key", messagingProfileId: PROFILE_ID });
        });

        it("switches back to Twilio, and only Twilio, keeping what was saved for each", async () => {
            await adminAgent.put("/api/settings/sms").send({ provider: "telnyx", telnyx: { apiKey: "KEY-the-telnyx-key" } });
            await messaging.sendSMS("login-otp", { totp: "1" }, TO);
            expect(postJson).toHaveBeenCalledTimes(1);

            const back = await adminAgent.put("/api/settings/sms").send({ provider: "twilio" });
            await messaging.sendSMS("login-otp", { totp: "2" }, TO);

            // Twilio's client was rebuilt from what was kept, and nothing more went through Telnyx.
            expect(back.body).toMatchObject({ provider: "twilio", twilio: { accountSid: SID, tokenSet: true }, telnyx: { apiKeySet: true } });
            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: SID, token: CONFIG_TWILIO.token, options: undefined });
            expect(smsCreate).toHaveBeenCalledTimes(1);
            expect(postJson).toHaveBeenCalledTimes(1);
            expect(messaging.telnyx).toBeUndefined();
            const row = await settingsRow();
            expect(decryptSecret(row.telnyxApiKey, ENCRYPTION_KEY)).toBe("KEY-the-telnyx-key");
        });

        it("has no provider in use, sending nothing, when Telnyx is chosen but has no API key", async () => {
            const res = await adminAgent.put("/api/settings/sms").send({ provider: "telnyx" });

            expect(res.body).toMatchObject({ provider: "telnyx", configured: false, twilio: { tokenSet: true }, telnyx: { apiKeySet: false } });
            await expect(messaging.sendSMS("login-otp", { totp: "1" }, TO)).rejects.toThrow("SMS is not configured.");
            expect(smsCreate).not.toHaveBeenCalled();
            expect(postJson).not.toHaveBeenCalled();
        });

        it("goes back to whichever provider has credentials when the provider is cleared with null", async () => {
            await adminAgent.put("/api/settings/sms").send({ provider: "telnyx", telnyx: { apiKey: "KEY-the-telnyx-key" } });

            const res = await adminAgent.put("/api/settings/sms").send({ provider: null });

            // Twilio has credentials as well as Telnyx, and is preferred.
            expect(res.body).toMatchObject({ provider: "twilio", configured: true });
            const row = await settingsRow();
            expect(row.smsProvider).toBeNull();
        });

        it("can be reset to what config says, discarding what was saved", async () => {
            await adminAgent
                .put("/api/settings/sms")
                .send({ provider: "telnyx", twilio: { accountSid: OTHER_SID, token: "changed-token" }, telnyx: { apiKey: "KEY-changed", messagingProfileId: PROFILE_ID }, from: "Changed" });

            const res = await adminAgent.post("/api/settings/sms/reset");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                provider: "twilio",
                twilio: { accountSid: SID, tokenSet: true },
                telnyx: { apiKeySet: false },
                from: CONFIG_FROM.sms,
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain(CONFIG_TWILIO.token);
            expect((await adminAgent.get("/api/settings/sms")).body).toEqual(res.body);
            const row = await settingsRow();
            expect(decryptSecret(row.twilioToken, ENCRYPTION_KEY)).toBe(CONFIG_TWILIO.token);
            expect(row.smsProvider).toBe("twilio");
            expect(row.telnyxApiKey).toBeNull();
            expect(row.telnyxMessagingProfileId).toBeNull();
        });

        it("has the next SMS use config's provider and credentials again after a reset, with no restart", async () => {
            await adminAgent.put("/api/settings/sms").send({ twilio: { accountSid: OTHER_SID, token: "changed-token" }, from: "Changed" });
            await messaging.sendSMS("login-otp", { totp: "1" }, TO);
            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: OTHER_SID, token: "changed-token", options: undefined });

            await adminAgent.post("/api/settings/sms/reset");
            await messaging.sendSMS("login-otp", { totp: "2" }, TO);

            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: SID, token: CONFIG_TWILIO.token, options: undefined });
            expect(smsCreate).toHaveBeenLastCalledWith(expect.objectContaining({ from: CONFIG_FROM.sms }));
        });

        it("leaves the SMTP and WhatsApp settings as they were when SMS is reset", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.changed.test", from: "changed@acme.test" });
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID });

            await adminAgent.post("/api/settings/sms/reset");

            expect((await adminAgent.get("/api/settings/smtp")).body).toMatchObject({ host: "smtp.changed.test", from: "changed@acme.test" });
            expect((await adminAgent.get("/api/settings/whatsapp")).body).toMatchObject({ phoneNumberId: OTHER_PHONE_NUMBER_ID });
        });

        it("refuses a provider, SID, token, profile ID or sender that can't be right, saving nothing", async () => {
            expect((await adminAgent.put("/api/settings/sms").send({ provider: "vonage" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ provider: "" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ twilio: { accountSid: "not-a-sid" } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ twilio: { token: "" } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ twilio: { token: 12 } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: "" } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: 12 } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ telnyx: { messagingProfileId: "not a valid id!" } })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/sms").send({ from: "5555550100" })).status).toBe(400);

            expect((await adminAgent.get("/api/settings/sms")).body).toEqual({
                provider: "twilio",
                twilio: { accountSid: SID, tokenSet: true },
                telnyx: { apiKeySet: false },
                from: CONFIG_FROM.sms,
                configured: true,
            });
        });

        it("refuses a `twilio` or `telnyx` block that isn't an object", async () => {
            for (const value of ["AC123", 5, true, null, ["accountSid"]]) {
                const twilio = await adminAgent.put("/api/settings/sms").send({ twilio: value });
                const telnyx = await adminAgent.put("/api/settings/sms").send({ telnyx: value });

                expect(twilio.status, `twilio ${JSON.stringify(value)}`).toBe(400);
                expect(twilio.body.message ?? JSON.stringify(twilio.body)).toContain("`twilio` must be an object.");
                expect(telnyx.status, `telnyx ${JSON.stringify(value)}`).toBe(400);
                expect(telnyx.body.message ?? JSON.stringify(telnyx.body)).toContain("`telnyx` must be an object.");
            }
        });

        it("treats a request with no body as no changes", async () => {
            const res = await adminAgent.put("/api/settings/sms");

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ provider: "twilio", configured: true });
        });

        it("refuses to store a token or API key without an encryption key, rather than store it in the clear", async () => {
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const twilio = await adminAgent.put("/api/settings/sms").send({ twilio: { token: "the-auth-token" } });
                const telnyx = await adminAgent.put("/api/settings/sms").send({ telnyx: { apiKey: "KEY-the-telnyx-key" } });

                for (const res of [twilio, telnyx]) {
                    expect(res.status).toBe(500);
                    expect(res.body.message ?? JSON.stringify(res.body)).toContain("auth:oauth_server:keys:encryption_key");
                }
            } finally {
                messaging.encryptionKey = original;
            }
        });

        it("refuses to reset without an encryption key, changing nothing", async () => {
            await adminAgent.put("/api/settings/sms").send({ from: "Changed" });
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.post("/api/settings/sms/reset");

                expect(res.status).toBe(500);
                expect((await adminAgent.get("/api/settings/sms")).body.from).toBe("Changed");
            } finally {
                messaging.encryptionKey = original;
            }
        });
    });

    describe("WhatsApp settings", () => {
        const TO = { to: "15555550123" };

        async function settingsRow(): Promise<any> {
            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            return repo.findOne("default", { ignoreACL: true });
        }

        it("saves the phone number ID, access token and API version, reporting the token as set without ever returning it", async () => {
            const res = await adminAgent
                .put("/api/settings/whatsapp")
                .send({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessToken: "the-wa-token", apiVersion: "v23.0" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v23.0", configured: true });
            expect(JSON.stringify(res.body)).not.toContain("the-wa-token");
            expect((await adminAgent.get("/api/settings/whatsapp")).body).toEqual(res.body);
        });

        it("stores the access token encrypted, never in the clear", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "the-wa-token" });

            const row = await settingsRow();

            expect(row.whatsappAccessToken).toMatch(/^enc:v1:/);
            expect(row.whatsappAccessToken).not.toContain("the-wa-token");
            expect(decryptSecret(row.whatsappAccessToken, ENCRYPTION_KEY)).toBe("the-wa-token");
        });

        it("has the next WhatsApp message use the saved credentials, with no restart", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessToken: "the-wa-token", apiVersion: "v21.0" });

            await messaging.sendWhatsApp("login-otp", { totp: "482913" }, TO);

            const [provider, url, token, body] = postJson.mock.calls[0];
            expect(provider).toBe("WhatsApp");
            expect(url).toBe(`https://graph.facebook.com/v21.0/${OTHER_PHONE_NUMBER_ID}/messages`);
            expect(token).toBe("the-wa-token");
            expect(body).toMatchObject({ messaging_product: "whatsapp", to: "15555550123", type: "text", text: { body: expect.stringContaining("482913") } });
        });

        it("uses a rotated token straight away", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "first-token" });
            await messaging.sendWhatsApp("login-otp", { totp: "1" }, TO);
            await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "second-token" });
            await messaging.sendWhatsApp("login-otp", { totp: "2" }, TO);

            expect(postJson.mock.calls.map((call) => call[2])).toEqual(["first-token", "second-token"]);
        });

        it("leaves whatever wasn't sent as it was", async () => {
            const res = await adminAgent.put("/api/settings/whatsapp").send({ apiVersion: "v20.0" });

            expect(res.body).toEqual({ phoneNumberId: CONFIG_WHATSAPP.phoneNumberId, accessTokenSet: true, apiVersion: "v20.0", configured: true });
        });

        it("says whether a WhatsApp message could be sent, and follows it with isWhatsAppConfigured()", async () => {
            expect(await messaging.isWhatsAppConfigured()).toBe(true);

            const cleared = await adminAgent.put("/api/settings/whatsapp").send({ accessToken: null });
            expect(cleared.body).toEqual({ phoneNumberId: CONFIG_WHATSAPP.phoneNumberId, accessTokenSet: false, apiVersion: CONFIG_WHATSAPP.apiVersion, configured: false });
            expect(await messaging.isWhatsAppConfigured()).toBe(false);

            const set = await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "new-token" });
            expect(set.body.configured).toBe(true);
            expect(await messaging.isWhatsAppConfigured()).toBe(true);
        });

        it("stops sending, without going back to config, once the credentials are cleared", async () => {
            const cleared = await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: null, accessToken: null, apiVersion: null });

            expect(cleared.body).toEqual({ accessTokenSet: false, configured: false });
            await expect(messaging.sendWhatsApp("login-otp", { totp: "1" }, TO)).rejects.toThrow("WhatsApp is not configured.");
            expect(postJson).not.toHaveBeenCalled();
            expect(await messaging.isWhatsAppConfigured()).toBe(false);
        });

        it("can be reset to what config says, discarding what was saved", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessToken: "changed-token", apiVersion: "v19.0" });

            const res = await adminAgent.post("/api/settings/whatsapp/reset");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                phoneNumberId: CONFIG_WHATSAPP.phoneNumberId,
                accessTokenSet: true,
                apiVersion: CONFIG_WHATSAPP.apiVersion,
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain(CONFIG_WHATSAPP.accessToken);
            expect((await adminAgent.get("/api/settings/whatsapp")).body).toEqual(res.body);
            const row = await settingsRow();
            expect(decryptSecret(row.whatsappAccessToken, ENCRYPTION_KEY)).toBe(CONFIG_WHATSAPP.accessToken);
        });

        it("has the next WhatsApp message use config's credentials again after a reset, with no restart", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessToken: "changed-token" });
            await messaging.sendWhatsApp("login-otp", { totp: "1" }, TO);

            await adminAgent.post("/api/settings/whatsapp/reset");
            await messaging.sendWhatsApp("login-otp", { totp: "2" }, TO);

            expect(postJson.mock.calls.map((call) => [call[1], call[2]])).toEqual([
                [`https://graph.facebook.com/v22.0/${OTHER_PHONE_NUMBER_ID}/messages`, "changed-token"],
                [`https://graph.facebook.com/v22.0/${CONFIG_WHATSAPP.phoneNumberId}/messages`, CONFIG_WHATSAPP.accessToken],
            ]);
        });

        it("leaves the SMTP and SMS settings as they were when WhatsApp is reset", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.changed.test" });
            await adminAgent.put("/api/settings/sms").send({ from: "Changed" });

            await adminAgent.post("/api/settings/whatsapp/reset");

            expect((await adminAgent.get("/api/settings/smtp")).body.host).toBe("smtp.changed.test");
            expect((await adminAgent.get("/api/settings/sms")).body.from).toBe("Changed");
        });

        it("refuses a phone number ID, API version or token that can't be right, saving nothing", async () => {
            expect((await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: "+15555550100" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: "123" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: 109876543210 })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ apiVersion: "23.0" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ apiVersion: "latest" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/whatsapp").send({ accessToken: 12 })).status).toBe(400);

            expect((await adminAgent.get("/api/settings/whatsapp")).body).toEqual({
                phoneNumberId: CONFIG_WHATSAPP.phoneNumberId,
                accessTokenSet: true,
                apiVersion: CONFIG_WHATSAPP.apiVersion,
                configured: true,
            });
        });

        it("treats a request with no body as no changes", async () => {
            const res = await adminAgent.put("/api/settings/whatsapp");

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ phoneNumberId: CONFIG_WHATSAPP.phoneNumberId, configured: true });
        });

        it("refuses to store a token without an encryption key, rather than store it in the clear", async () => {
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.put("/api/settings/whatsapp").send({ accessToken: "the-wa-token" });

                expect(res.status).toBe(500);
                expect(res.body.message ?? JSON.stringify(res.body)).toContain("auth:oauth_server:keys:encryption_key");
            } finally {
                messaging.encryptionKey = original;
            }
        });

        it("refuses to reset without an encryption key, changing nothing", async () => {
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID });
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.post("/api/settings/whatsapp/reset");

                expect(res.status).toBe(500);
                expect((await adminAgent.get("/api/settings/whatsapp")).body.phoneNumberId).toBe(OTHER_PHONE_NUMBER_ID);
            } finally {
                messaging.encryptionKey = original;
            }
        });
    });

    describe("SMTP settings", () => {
        it("saves the server, credentials and sender, reporting the password as set without ever returning it", async () => {
            const res = await adminAgent
                .put("/api/settings/smtp")
                .send({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", password: "new-pass", from: "Acme <saved@acme.test>" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                host: "smtp.new.test",
                port: 465,
                secure: true,
                user: "new-user",
                passwordSet: true,
                from: "Acme <saved@acme.test>",
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain("new-pass");
            expect((await adminAgent.get("/api/settings/smtp")).body).toEqual(res.body);
        });

        it("stores the password encrypted, never in the clear", async () => {
            await adminAgent.put("/api/settings/smtp").send({ password: "new-pass" });

            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            const row = await repo.findOne("default", { ignoreACL: true });

            expect(row!.smtpPassword).toMatch(/^enc:v1:/);
            expect(row!.smtpPassword).not.toContain("new-pass");
            expect(decryptSecret(row!.smtpPassword, ENCRYPTION_KEY)).toBe("new-pass");
        });

        it("has the next e-mail use the saved settings and sender, with no restart", async () => {
            await adminAgent
                .put("/api/settings/smtp")
                .send({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", password: "new-pass", from: "Acme <saved@acme.test>" });

            const email = await sendLoginEmail();

            expect(smtpBuild).toHaveBeenCalledWith({
                tls: CONFIG_SMTP.tls,
                host: "smtp.new.test",
                port: 465,
                secure: true,
                auth: { user: "new-user", pass: "new-pass" },
            });
            expect(email.from).toBe("Acme <saved@acme.test>");
        });

        it("keeps the deployment's other nodemailer options when it builds the transport", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.new.test" });
            await sendLoginEmail();

            expect(smtpBuild).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.new.test", tls: CONFIG_SMTP.tls }));
        });

        it("uses a rotated password straight away, and builds the transport once per change", async () => {
            await adminAgent.put("/api/settings/smtp").send({ password: "first-pass" });
            await sendLoginEmail();
            await sendLoginEmail();
            expect(smtpBuild).toHaveBeenCalledTimes(1);

            await adminAgent.put("/api/settings/smtp").send({ password: "second-pass" });
            await sendLoginEmail();

            expect(smtpBuild).toHaveBeenCalledTimes(2);
            expect(smtpBuild).toHaveBeenLastCalledWith(expect.objectContaining({ auth: { user: CONFIG_SMTP.auth.user, pass: "second-pass" } }));
        });

        it("changes only the sender, without rebuilding the transport", async () => {
            await adminAgent.put("/api/settings/smtp").send({ from: "Other <other@acme.test>" });

            const email = await sendLoginEmail();

            expect(email.from).toBe("Other <other@acme.test>");
            expect(smtpBuild).not.toHaveBeenCalled();
        });

        it("stops sending, without going back to config, once the host is cleared", async () => {
            const cleared = await adminAgent.put("/api/settings/smtp").send({ host: null });

            expect(cleared.body).toMatchObject({ configured: false, from: CONFIG_FROM.email });
            await expect(messaging.sendEmail("login-otp", { totp: "1" }, { to: "user@acme.test" })).rejects.toThrow("E-mail is not configured.");
        });

        it("sends nothing, without failing the send, once the sender is cleared", async () => {
            await adminAgent.put("/api/settings/smtp").send({ from: null });

            sendMail.mockClear();
            await messaging.sendEmail("login-otp", { totp: "1" }, { to: "user@acme.test" });

            expect(sendMail).not.toHaveBeenCalled();
        });

        it("can be reset to what config says, discarding what was saved", async () => {
            await adminAgent
                .put("/api/settings/smtp")
                .send({ host: "smtp.changed.test", port: 25, secure: true, user: "changed-user", password: "changed-pass", from: "changed@acme.test" });

            const res = await adminAgent.post("/api/settings/smtp/reset");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                host: CONFIG_SMTP.host,
                port: CONFIG_SMTP.port,
                secure: false,
                user: CONFIG_SMTP.auth.user,
                passwordSet: true,
                from: CONFIG_FROM.email,
                configured: true,
            });
            expect(JSON.stringify(res.body)).not.toContain(CONFIG_SMTP.auth.pass);
            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            const row = await repo.findOne("default", { ignoreACL: true });
            expect(decryptSecret(row!.smtpPassword, ENCRYPTION_KEY)).toBe(CONFIG_SMTP.auth.pass);
        });

        it("has the next e-mail use config's server and sender again after a reset, with no restart", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.changed.test", from: "changed@acme.test" });
            const changed = await sendLoginEmail();
            expect(changed.from).toBe("changed@acme.test");

            await adminAgent.post("/api/settings/smtp/reset");
            const reset = await sendLoginEmail();

            expect(reset.from).toBe(CONFIG_FROM.email);
            expect(smtpBuild).toHaveBeenLastCalledWith(
                expect.objectContaining({ host: CONFIG_SMTP.host, port: CONFIG_SMTP.port, auth: CONFIG_SMTP.auth, tls: CONFIG_SMTP.tls }),
            );
        });

        it("leaves the SMS and WhatsApp settings as they were when SMTP is reset", async () => {
            await adminAgent.put("/api/settings/sms").send({ from: "Changed", twilio: { accountSid: OTHER_SID } });
            await adminAgent.put("/api/settings/whatsapp").send({ phoneNumberId: OTHER_PHONE_NUMBER_ID });

            await adminAgent.post("/api/settings/smtp/reset");

            expect((await adminAgent.get("/api/settings/sms")).body).toMatchObject({ twilio: { accountSid: OTHER_SID }, from: "Changed" });
            expect((await adminAgent.get("/api/settings/whatsapp")).body).toMatchObject({ phoneNumberId: OTHER_PHONE_NUMBER_ID });
        });

        it("refuses to reset without an encryption key, changing nothing", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.changed.test" });
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.post("/api/settings/smtp/reset");

                expect(res.status).toBe(500);
                expect((await adminAgent.get("/api/settings/smtp")).body.host).toBe("smtp.changed.test");
            } finally {
                messaging.encryptionKey = original;
            }
        });

        it("refuses settings that can't be right, and a sender that would let a header be injected, saving nothing", async () => {
            expect((await adminAgent.put("/api/settings/smtp").send({ host: "smtp://smtp.new.test" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/smtp").send({ port: 0 })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/smtp").send({ secure: "yes" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/smtp").send({ password: "" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/smtp").send({ from: "not-an-address" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/smtp").send({ from: "a@b.c\nBcc: victim@example.com" })).status).toBe(400);

            expect((await adminAgent.get("/api/settings/smtp")).body.host).toBe(CONFIG_SMTP.host);
        });

        it("refuses to store a password without an encryption key, rather than store it in the clear", async () => {
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.put("/api/settings/smtp").send({ password: "new-pass" });

                expect(res.status).toBe(500);
                expect(res.body.message ?? JSON.stringify(res.body)).toContain("auth:oauth_server:keys:encryption_key");
            } finally {
                messaging.encryptionKey = original;
            }
        });
    });
});
