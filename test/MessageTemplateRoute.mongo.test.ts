///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end coverage of database-backed message templates and Twilio credentials against a real (if lightweight)
// running server: the admin API, the storage behind it, and — the part unit tests can't show — that the
// `MessagingUtils` every `@rapidrest/auth` route was handed really is the database-backed one, so an edit made
// through the API is what the next real send renders. Only the SMTP/Twilio transports are faked. See
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
        config.set("twilio", CONFIG_TWILIO);
        config.set("auth:oauth_server:keys:encryption_key", ENCRYPTION_KEY);
        await server.start();

        messaging = objectFactory.getInstance(MessagingUtils);
        sendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
        smsCreate = vi.fn().mockResolvedValue({ sid: "SM1" });
        // Wherever the server builds a transport or client from what's in effect, hand back the same fakes.
        smtpBuild = vi.spyOn(messaging, "createSmtpTransport").mockImplementation(async () => ({ sendMail }));
        twilioBuild = vi.spyOn(messaging, "createTwilioClient").mockImplementation(async () => ({ messages: { create: smsCreate } }));

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
        await adminAgent.put("/api/settings/twilio").send({ accountSid: CONFIG_TWILIO.accountSid, token: CONFIG_TWILIO.token, from: CONFIG_FROM.sms });
        messaging.smtpKey = undefined;
        messaging.twilioKey = undefined;
        messaging.smtpConfig = CONFIG_SMTP;
        messaging._transporter = { sendMail };
        messaging.twilio = { messages: { create: smsCreate } };
        sendMail.mockClear();
        smsCreate.mockClear();
        smtpBuild.mockClear();
        twilioBuild.mockClear();
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
            expect((await request(server).get("/api/settings/twilio")).status).toBe(401);
            expect((await request(server).put("/api/settings/twilio").send({})).status).toBe(401);
            expect((await request(server).get("/api/settings/smtp")).status).toBe(401);
            expect((await request(server).put("/api/settings/smtp").send({})).status).toBe(401);
            expect((await request(server).post("/api/settings/twilio/reset")).status).toBe(401);
            expect((await request(server).post("/api/settings/smtp/reset")).status).toBe(401);
        });

        it("refuses a signed-in caller without the trusted 'admin' role, reads included", async () => {
            const plain = agent(server);
            await createAndSignInUser(plain, "plain-templates-user");

            expect((await plain.get("/api/settings/messages")).status).toBe(403);
            expect((await plain.get("/api/settings/messages/login-otp")).status).toBe(403);
            expect((await plain.put("/api/settings/messages/login-otp").send({ subject: "x" })).status).toBe(403);
            expect((await plain.get("/api/settings/twilio")).status).toBe(403);
            expect((await plain.put("/api/settings/twilio").send({ accountSid: SID })).status).toBe(403);
            expect((await plain.get("/api/settings/smtp")).status).toBe(403);
            expect((await plain.put("/api/settings/smtp").send({ host: "smtp.evil.test" })).status).toBe(403);
            expect((await plain.post("/api/settings/twilio/reset")).status).toBe(403);
            expect((await plain.post("/api/settings/smtp/reset")).status).toBe(403);
        });

        it("refuses a trusted-role caller who hasn't elevated", async () => {
            const notElevated = agent(server);
            await createAndSignInUser(notElevated, "admin-templates-not-elevated", ["admin"]);

            expect((await notElevated.get("/api/settings/messages")).status).toBe(403);
            expect((await notElevated.put("/api/settings/twilio").send({ accountSid: SID })).status).toBe(403);
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
            expect(res.body.overridden).toEqual({ enabled: false, subject: false, text: false, html: false, sms: false });
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
            expect(res.body.overridden).toMatchObject({ subject: true, text: false, html: false, sms: false });
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
        it("has the Twilio settings config provided, without the token", async () => {
            const res = await request(server).get("/api/settings/twilio");
            expect(res.status).toBe(401);

            const seeded = await adminAgent.get("/api/settings/twilio");

            expect(seeded.body).toEqual({ accountSid: SID, tokenSet: true, from: CONFIG_FROM.sms, configured: true });
            expect(JSON.stringify(seeded.body)).not.toContain(CONFIG_TWILIO.token);
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
            expect(row!.smtpPassword).toMatch(/^enc:v1:/);
            expect(JSON.stringify(row)).not.toContain(CONFIG_TWILIO.token);
            expect(JSON.stringify(row)).not.toContain(CONFIG_SMTP.auth.pass);
        });
    });

    describe("Twilio settings", () => {
        it("saves the SID, token and sender, reporting the token as set without ever returning it", async () => {
            const res = await adminAgent.put("/api/settings/twilio").send({ accountSid: OTHER_SID, token: "the-auth-token", from: "Acme" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ accountSid: OTHER_SID, tokenSet: true, from: "Acme", configured: true });
            expect(JSON.stringify(res.body)).not.toContain("the-auth-token");
            const read = await adminAgent.get("/api/settings/twilio");
            expect(read.body).toEqual(res.body);
        });

        it("stores the token encrypted, never in the clear", async () => {
            await adminAgent.put("/api/settings/twilio").send({ token: "the-auth-token" });

            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            const row = await repo.findOne("default", { ignoreACL: true });

            expect(row!.twilioToken).toMatch(/^enc:v1:/);
            expect(row!.twilioToken).not.toContain("the-auth-token");
            expect(decryptSecret(row!.twilioToken, ENCRYPTION_KEY)).toBe("the-auth-token");
        });

        it("has the next SMS use the saved credentials and sender, with no restart", async () => {
            await adminAgent.put("/api/settings/twilio").send({ accountSid: OTHER_SID, token: "the-auth-token", from: "Acme" });

            await messaging.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" });

            expect(twilioBuild).toHaveBeenCalledWith({ accountSid: OTHER_SID, token: "the-auth-token", options: undefined });
            expect(smsCreate).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "Acme", body: expect.stringContaining("482913") }));
        });

        it("uses a rotated token straight away, and builds the client once per change", async () => {
            await adminAgent.put("/api/settings/twilio").send({ token: "first-token" });
            await messaging.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });
            await messaging.sendSMS("login-otp", { totp: "2" }, { to: "+15555550123" });
            expect(twilioBuild).toHaveBeenCalledTimes(1);

            await adminAgent.put("/api/settings/twilio").send({ token: "second-token" });
            await messaging.sendSMS("login-otp", { totp: "3" }, { to: "+15555550123" });

            expect(twilioBuild).toHaveBeenCalledTimes(2);
            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: SID, token: "second-token", options: undefined });
        });

        it("leaves whatever wasn't sent as it was", async () => {
            const res = await adminAgent.put("/api/settings/twilio").send({ from: "+15555550111" });

            expect(res.body).toEqual({ accountSid: SID, tokenSet: true, from: "+15555550111", configured: true });
        });

        it("stops sending, without going back to config, once the credentials are cleared", async () => {
            const cleared = await adminAgent.put("/api/settings/twilio").send({ accountSid: null, token: null });

            expect(cleared.body).toEqual({ tokenSet: false, from: CONFIG_FROM.sms, configured: false });
            await expect(messaging.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" })).rejects.toThrow("Twilio is not configured.");
        });

        it("sends nothing, without failing the send, once the sender is cleared", async () => {
            await adminAgent.put("/api/settings/twilio").send({ from: null });

            await messaging.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });

            expect(smsCreate).not.toHaveBeenCalled();
        });

        it("can be reset to what config says, discarding what was saved", async () => {
            await adminAgent.put("/api/settings/twilio").send({ accountSid: OTHER_SID, token: "changed-token", from: "Changed" });

            const res = await adminAgent.post("/api/settings/twilio/reset");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ accountSid: SID, tokenSet: true, from: CONFIG_FROM.sms, configured: true });
            expect(JSON.stringify(res.body)).not.toContain(CONFIG_TWILIO.token);
            expect((await adminAgent.get("/api/settings/twilio")).body).toEqual(res.body);
            const repo = await objectFactory.newInstance(RepoUtils, { name: "MessagingSettingsMongo", args: [MessagingSettingsMongo] });
            const row = await repo.findOne("default", { ignoreACL: true });
            expect(decryptSecret(row!.twilioToken, ENCRYPTION_KEY)).toBe(CONFIG_TWILIO.token);
        });

        it("has the next SMS use config's credentials again after a reset, with no restart", async () => {
            await adminAgent.put("/api/settings/twilio").send({ accountSid: OTHER_SID, token: "changed-token", from: "Changed" });
            await messaging.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });
            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: OTHER_SID, token: "changed-token", options: undefined });

            await adminAgent.post("/api/settings/twilio/reset");
            await messaging.sendSMS("login-otp", { totp: "2" }, { to: "+15555550123" });

            expect(twilioBuild).toHaveBeenLastCalledWith({ accountSid: SID, token: CONFIG_TWILIO.token, options: undefined });
            expect(smsCreate).toHaveBeenLastCalledWith(expect.objectContaining({ from: CONFIG_FROM.sms }));
        });

        it("leaves the SMTP settings as they were when Twilio is reset", async () => {
            await adminAgent.put("/api/settings/smtp").send({ host: "smtp.changed.test", from: "changed@acme.test" });

            await adminAgent.post("/api/settings/twilio/reset");

            expect((await adminAgent.get("/api/settings/smtp")).body).toMatchObject({ host: "smtp.changed.test", from: "changed@acme.test" });
        });

        it("refuses a SID, token or sender that can't be right, saving nothing", async () => {
            expect((await adminAgent.put("/api/settings/twilio").send({ accountSid: "not-a-sid" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/twilio").send({ token: "" })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/twilio").send({ token: 12 })).status).toBe(400);
            expect((await adminAgent.put("/api/settings/twilio").send({ from: "5555550100" })).status).toBe(400);

            expect((await adminAgent.get("/api/settings/twilio")).body).toEqual({ accountSid: SID, tokenSet: true, from: CONFIG_FROM.sms, configured: true });
        });

        it("refuses to store a token without an encryption key, rather than store it in the clear", async () => {
            const original = messaging.encryptionKey;
            messaging.encryptionKey = "";
            try {
                const res = await adminAgent.put("/api/settings/twilio").send({ token: "the-auth-token" });

                expect(res.status).toBe(500);
                expect(res.body.message ?? JSON.stringify(res.body)).toContain("auth:oauth_server:keys:encryption_key");
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

        it("leaves the Twilio settings as they were when SMTP is reset", async () => {
            await adminAgent.put("/api/settings/twilio").send({ from: "Changed", accountSid: OTHER_SID });

            await adminAgent.post("/api/settings/smtp/reset");

            expect((await adminAgent.get("/api/settings/twilio")).body).toMatchObject({ accountSid: OTHER_SID, from: "Changed" });
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
