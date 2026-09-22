///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Isolated unit tests for BaseDatabaseMessagingUtils — no HTTP server, no database. The templates repository and the
// site-settings repository are fakes; everything from template lookup to Handlebars rendering is the real code (only
// the SMTP transport, the Twilio client and the HTTP request Telnyx and WhatsApp are sent with are replaced). See
// MessageTemplateRoute.*.test.ts for the same thing end to end.
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseDatabaseMessagingUtils } from "../src/messaging/BaseDatabaseMessagingUtils.js";
import { decryptSecret, encryptSecret } from "../src/messaging/SecretBox.js";

class FakeTemplate {
    constructor(other?: Record<string, unknown>) {
        Object.assign(this, other);
    }
}
class FakeSettings {}
class FakeMessagingSettings {
    constructor(other?: Record<string, unknown>) {
        Object.assign(this, other);
    }
}

const KEY = "96aa4879e304e525b74141bf1bc072c17e2b90c5b35250a2d18cbd2b8d4172ac";
const SID = "AC" + "0123456789abcdef".repeat(2);
const OTHER_SID = "AC" + "fedcba9876543210".repeat(2);
const OTHER_KEY = "00".repeat(31) + "01";
const PROFILE_ID = "40017a5c-2d1f-4d4e-9d0a-6a3f2d1b9c11";
const PHONE_NUMBER_ID = "109876543210";
const OTHER_PHONE_NUMBER_ID = "555000111222";

class TestUtils extends BaseDatabaseMessagingUtils {
    protected templateClass = FakeTemplate;
    protected settingsClass = FakeSettings;
    protected messagingSettingsClass = FakeMessagingSettings;
}

const TEMPLATES = {
    from: { email: "no-reply@acme.test", sms: "+15555550100" },
    "login-otp": {
        enabled: true,
        description: "Sign in.",
        subject: "Your {{{brand.name}}} code",
        text: "{{{brand.name}}}: {{totp}}",
        html: "<p>{{brand.name}} {{totp}}</p>",
        sms: "{{{brand.name}}}: {{totp}}",
        whatsapp: "{{{brand.name}}} WhatsApp: {{totp}}",
    },
    "register-otp": { enabled: true, subject: "Register", text: "{{totp}}", sms: "{{totp}}" },
};

/** `TEMPLATES`, but with `login-otp` sent as an approved WhatsApp message template, as a deployment that set one up would have it. */
function templatesWithWhatsAppTemplate() {
    const templates = structuredClone(TEMPLATES) as Record<string, any>;
    templates["login-otp"].whatsapp_template = { name: "login_code", language: "en_US", parameters: ["{{totp}}", "{{{brand.name}}}"] };
    return templates;
}

interface Options {
    templates?: Record<string, any>;
    rows?: Record<string, any>;
    settings?: Record<string, any>;
    serverUrl?: string;
    failTemplateRead?: boolean;
    failSettingsRead?: boolean;
    withoutObjectFactory?: boolean;
    /** The saved messaging settings row. */
    messagingRow?: Record<string, any>;
    failMessagingRead?: boolean;
    /**
     * The deployment's `sms_config` block, which MessagingUtils.init() would already have built a client from.
     * Left out, there's no config for it but a stand-in Twilio client is in place, so plain sends work; `null` is
     * no config and no client at all.
     */
    smsConfig?: { provider: string; config?: Record<string, any> } | null;
    /** The deployment's `whatsapp` config block, which MessagingUtils.init() would already have taken the credentials from. */
    whatsappConfig?: Record<string, any> | null;
    /** The deployment's `smtp_config` block, which MessagingUtils.init() would already have built a transport from. */
    smtpConfig?: Record<string, any> | null;
    encryptionKey?: string;
    /** Leaves core's own `postJson` in place, so a request goes to (a mocked) axios rather than to a spy. */
    realPostJson?: boolean;
}

function makeUtils(options: Options = {}) {
    const rows = new Map<string, any>(Object.entries(options.rows ?? {}));
    const templateRepo = {
        findOne: vi.fn(async (uid: string) => {
            if (options.failTemplateRead) throw new Error("db down");
            return rows.get(uid);
        }),
        create: vi.fn(async (obj: any) => {
            const row = { ...obj, version: 0 };
            rows.set(obj.uid, row);
            return row;
        }),
        update: vi.fn(async (obj: any, existing: any) => {
            const row = { ...obj, version: existing.version + 1 };
            rows.set(existing.uid, row);
            return row;
        }),
        delete: vi.fn(async (uid: string) => {
            rows.delete(uid);
        }),
    };
    const settingsRepo = {
        findOne: vi.fn(async () => {
            if (options.failSettingsRead) throw new Error("settings down");
            // Already seeded from config (see getOrCreateSiteSettings), so reading it never writes.
            return { uid: "default", seeded: true, ...(options.settings ?? {}) };
        }),
        create: vi.fn(),
    };

    let messagingRow: any = options.messagingRow;
    const messagingRepo = {
        findOne: vi.fn(async () => {
            if (options.failMessagingRead) throw new Error("messaging down");
            return messagingRow;
        }),
        create: vi.fn(async (obj: any) => {
            messagingRow = { ...obj, version: 0 };
            return messagingRow;
        }),
        update: vi.fn(async (obj: any, existing: any) => {
            messagingRow = { ...obj, version: existing.version + 1 };
            return messagingRow;
        }),
    };

    const utils = new TestUtils() as any;
    const templates = options.templates ?? structuredClone(TEMPLATES);
    utils.configuredTemplates = templates;
    // MessagingUtils' own reference to the same configured object, as injection leaves it.
    utils.templates = templates;
    utils.serverUrl = options.serverUrl ?? "https://auth.acme.test";
    utils.logger = { warn: vi.fn() };
    if (!options.withoutObjectFactory) {
        utils._objectFactory = {
            newInstance: vi.fn(async (_type: unknown, opts: { args: unknown[] }) =>
                opts.args[0] === FakeTemplate ? templateRepo : opts.args[0] === FakeMessagingSettings ? messagingRepo : settingsRepo,
            ),
        };
    }
    const sendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
    const create = vi.fn().mockResolvedValue({ sid: "s1" });
    utils.smtpConfig = { host: "smtp.test" };
    utils._transporter = { sendMail };
    utils.encryptionKey = options.encryptionKey ?? KEY;
    utils.configuredSms = options.smsConfig ?? null;
    utils.configuredWhatsApp = options.whatsappConfig ?? null;
    utils.configuredSmtp = options.smtpConfig === undefined ? null : options.smtpConfig;
    // What MessagingUtils.init() leaves behind: a client (or Telnyx settings) built from the config credentials, if there are any.
    if (options.smsConfig === undefined) {
        utils.smsConfig = { provider: "twilio" };
        utils.twilio = { messages: { create }, builtFrom: "config" };
    } else {
        utils.smsConfig = options.smsConfig;
        if (options.smsConfig?.provider === "twilio" && options.smsConfig.config?.accountSid) {
            utils.twilio = { messages: { create }, builtFrom: "config" };
        }
        if (options.smsConfig?.provider === "telnyx" && options.smsConfig.config?.apiKey) {
            utils.telnyx = options.smsConfig.config;
        }
    }
    if (options.whatsappConfig?.accessToken && options.whatsappConfig.phoneNumberId) {
        utils.whatsapp = options.whatsappConfig;
    }
    // The HTTP request Telnyx and WhatsApp messages are sent with.
    const postJson = vi.fn().mockResolvedValue({ messages: [{ id: "wamid.1" }] });
    if (!options.realPostJson) {
        utils.postJson = postJson;
    }
    return {
        utils: utils,
        rows,
        templateRepo,
        settingsRepo,
        messagingRepo,
        getMessagingRow: () => messagingRow,
        sendMail,
        create,
        postJson,
        templates,
    };
}

const SEND = { to: "user@acme.test" };
const WHATSAPP_CONFIG = { accessToken: "config-wa-token", phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v22.0" };

describe("sending", () => {
    it("sends the default, with the site branding filled in, when nothing has been edited", async () => {
        const { utils, sendMail } = makeUtils({ settings: { companyName: "Acme" } });

        await utils.sendEmail("login-otp", { totp: "482913" }, SEND);

        expect(sendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "user@acme.test",
                from: "no-reply@acme.test",
                subject: "Your Acme code",
                text: "Acme: 482913",
                html: "<p>Acme 482913</p>",
            }),
        );
    });

    it("doesn't escape a brand name in plain text, but does in HTML", async () => {
        const { utils, sendMail } = makeUtils({ settings: { companyName: "Tom & Jerry" } });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        const message = sendMail.mock.calls[0][0];
        expect(message.subject).toBe("Your Tom & Jerry code");
        expect(message.text).toBe("Tom & Jerry: 1");
        expect(message.html).toBe("<p>Tom &amp; Jerry 1</p>");
    });

    it("sends what an admin saved instead of the default, part by part", async () => {
        const { utils, sendMail } = makeUtils({ rows: { "login-otp": { uid: "login-otp", subject: "Edited {{totp}}", html: null } } });

        await utils.sendEmail("login-otp", { totp: "482913" }, SEND);

        const message = sendMail.mock.calls[0][0];
        expect(message.subject).toBe("Edited 482913");
        // Untouched parts still follow the default.
        expect(message.text).toBe("RapidREST: 482913");
        expect(message.html).toBe("<p>RapidREST 482913</p>");
    });

    it("sends the next edit straight away, with nothing to invalidate", async () => {
        const { utils, sendMail, rows } = makeUtils();

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        rows.set("login-otp", { uid: "login-otp", subject: "Now different" });
        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        rows.delete("login-otp");
        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls.map(([m]) => m.subject)).toEqual(["Your RapidREST code", "Now different", "Your RapidREST code"]);
    });

    it("sends plain text only when an admin has saved an empty html part", async () => {
        const { utils, sendMail } = makeUtils({ rows: { "login-otp": { uid: "login-otp", html: "" } } });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls[0][0].html).toBeNull();
        expect(sendMail.mock.calls[0][0].text).toBe("RapidREST: 1");
    });

    it("doesn't send a template an admin has disabled, or a channel they've emptied", async () => {
        const disabled = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, rows: { "login-otp": { uid: "login-otp", enabled: false } } });
        await disabled.utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await disabled.utils.sendSMS("login-otp", { totp: "1" }, { to: "+1" });
        await disabled.utils.sendWhatsApp("login-otp", { totp: "1" }, { to: "1" });
        expect(disabled.sendMail).not.toHaveBeenCalled();
        expect(disabled.create).not.toHaveBeenCalled();
        expect(disabled.postJson).not.toHaveBeenCalled();

        const noSms = makeUtils({ rows: { "login-otp": { uid: "login-otp", sms: "" } } });
        await noSms.utils.sendSMS("login-otp", { totp: "1" }, { to: "+1" });
        await noSms.utils.sendEmail("login-otp", { totp: "1" }, SEND);
        expect(noSms.create).not.toHaveBeenCalled();
        expect(noSms.sendMail).toHaveBeenCalledTimes(1);

        const noWhatsApp = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, rows: { "login-otp": { uid: "login-otp", whatsapp: "" } } });
        await noWhatsApp.utils.sendWhatsApp("login-otp", { totp: "1" }, { to: "1" });
        await noWhatsApp.utils.sendSMS("login-otp", { totp: "1" }, { to: "+1" });
        expect(noWhatsApp.postJson).not.toHaveBeenCalled();
        expect(noWhatsApp.create).toHaveBeenCalledTimes(1);
    });

    it("sends an SMS with the branding too", async () => {
        const { utils, create } = makeUtils({ settings: { siteTitle: "Portal" } });

        await utils.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "+15555550100", body: "Portal: 482913" }));
    });

    it("sends a WhatsApp message with the branding too, from the phone number ID rather than a from number", async () => {
        const { utils, postJson } = makeUtils({ settings: { siteTitle: "Portal" }, whatsappConfig: WHATSAPP_CONFIG });

        await utils.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

        expect(postJson).toHaveBeenCalledTimes(1);
        const [provider, url, token, body] = postJson.mock.calls[0];
        expect(provider).toBe("WhatsApp");
        expect(url).toBe(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`);
        expect(token).toBe("config-wa-token");
        expect(body).toEqual({
            recipient_type: "individual",
            messaging_product: "whatsapp",
            to: "15555550123",
            type: "text",
            text: { body: "Portal WhatsApp: 482913" },
        });
    });

    it("sends what an admin saved for the WhatsApp message instead of the default", async () => {
        const { utils, postJson } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            rows: { "login-otp": { uid: "login-otp", whatsapp: "Edited WhatsApp {{totp}}" } },
        });

        await utils.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

        expect(postJson.mock.calls[0][3].text.body).toBe("Edited WhatsApp 482913");
    });

    it("sends an approved WhatsApp message template, its parameters filled in, when the config has one", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, templates: templatesWithWhatsAppTemplate() });

        await utils.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

        expect(postJson.mock.calls[0][3]).toMatchObject({
            type: "template",
            template: {
                name: "login_code",
                language: { code: "en_US" },
                components: [{ type: "body", parameters: [{ type: "text", text: "482913" }, { type: "text", text: "RapidREST" }] }],
            },
        });
        expect(postJson.mock.calls[0][3]).not.toHaveProperty("text");
    });

    it("sends an approved WhatsApp message template an admin saved, over a config that has none", async () => {
        const { utils, postJson } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            rows: {
                "login-otp": {
                    uid: "login-otp",
                    whatsappTemplateName: "saved_code",
                    whatsappTemplateLanguage: "fr",
                    whatsappTemplateParameters: "{{totp}}\r\n\r\n  {{{brand.name}}}  ",
                },
            },
        });

        await utils.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

        expect(postJson.mock.calls[0][3]).toMatchObject({
            type: "template",
            template: {
                name: "saved_code",
                language: { code: "fr" },
                components: [{ type: "body", parameters: [{ type: "text", text: "482913" }, { type: "text", text: "RapidREST" }] }],
            },
        });
    });

    it("goes back to the free-form message when an admin empties the template name the config sets", async () => {
        const { utils, postJson } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            templates: templatesWithWhatsAppTemplate(),
            rows: { "login-otp": { uid: "login-otp", whatsappTemplateName: "" } },
        });

        await utils.sendWhatsApp("login-otp", { totp: "482913" }, { to: "15555550123" });

        expect(postJson.mock.calls[0][3]).toMatchObject({ type: "text", text: { body: "RapidREST WhatsApp: 482913" } });
        expect(postJson.mock.calls[0][3]).not.toHaveProperty("template");
    });

    it("never writes an admin's WhatsApp template into the configured templates", async () => {
        const { utils, templates } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            rows: { "login-otp": { uid: "login-otp", whatsappTemplateName: "saved_code", whatsappTemplateLanguage: "fr" } },
        });
        const before = structuredClone(templates);

        await utils.sendWhatsApp("login-otp", { totp: "1" }, { to: "1" });

        expect(templates).toEqual(before);
        expect(templates["login-otp"].whatsapp_template).toBeUndefined();
    });

    it("lets a caller's own brand win over the site's", async () => {
        const { utils, sendMail } = makeUtils({ settings: { companyName: "Acme" } });

        await utils.sendEmail("login-otp", { totp: "1", brand: { name: "Other" } }, SEND);

        expect(sendMail.mock.calls[0][0].subject).toBe("Your Other code");
    });

    it("gives the branding to a Slack message too", async () => {
        const { utils } = makeUtils();

        await expect(utils.sendSlack("login-otp", { totp: "1" })).rejects.toThrow("Slack is not configured.");
    });

    it("fails for a template the config doesn't define, exactly as before", async () => {
        const { utils } = makeUtils();

        await expect(utils.sendEmail("no-such-template", { totp: "1" }, SEND)).rejects.toThrow("No template found with name no-such-template");
    });

    it("leaves `from` alone rather than treating it as a template", async () => {
        const { utils } = makeUtils();

        await expect(utils.loadTemplate("from")).resolves.toBeDefined();
    });

    it("never writes an admin's edits into the configured templates", async () => {
        const { utils, templates } = makeUtils({ rows: { "login-otp": { uid: "login-otp", subject: "Edited" } } });
        const before = structuredClone(templates);

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(templates).toEqual(before);
    });

    it("reads a template's html and text from their files, and prefers an admin's edit over the file", async () => {
        const file = path.join(os.tmpdir(), `rr-msg-${Date.now()}.html`);
        fs.writeFileSync(file, "<b>{{totp}} from file</b>");
        try {
            const templates = { from: TEMPLATES.from, "login-otp": { enabled: true, subject: "S", htmlPath: file } };

            const plain = makeUtils({ templates });
            await plain.utils.sendEmail("login-otp", { totp: "1" }, SEND);
            expect(plain.sendMail.mock.calls[0][0].html).toBe("<b>1 from file</b>");

            const edited = makeUtils({ templates, rows: { "login-otp": { uid: "login-otp", html: "<i>{{totp}} edited</i>" } } });
            await edited.utils.sendEmail("login-otp", { totp: "1" }, SEND);
            expect(edited.sendMail.mock.calls[0][0].html).toBe("<i>1 edited</i>");
        } finally {
            fs.rmSync(file, { force: true });
        }
    });
});

describe("when the database can't be reached", () => {
    it("sends the default instead of nothing, and says why", async () => {
        const { utils, sendMail } = makeUtils({ failTemplateRead: true, settings: { companyName: "Acme" } });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls[0][0].subject).toBe("Your Acme code");
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the saved edits for message template 'login-otp'"));
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("db down"));
    });

    it("sends with the stock brand when the site branding can't be read", async () => {
        const { utils, sendMail } = makeUtils({ failSettingsRead: true });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls[0][0].subject).toBe("Your RapidREST code");
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the site branding"));
    });

    it("reports a failure that isn't an Error by its text", async () => {
        const { utils, sendMail, templateRepo } = makeUtils();
        templateRepo.findOne.mockRejectedValueOnce("just a string");

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail).toHaveBeenCalledTimes(1);
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("just a string"));
    });

    it("still sends when there's no logger to report a failure to", async () => {
        const { utils, sendMail, templateRepo } = makeUtils();
        templateRepo.findOne.mockRejectedValueOnce(new Error("db down"));
        utils.logger = undefined;

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("falls back to the defaults when there's no object factory to reach the database with", async () => {
        const { utils, sendMail } = makeUtils({ withoutObjectFactory: true });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls[0][0].subject).toBe("Your RapidREST code");
    });

    it("does not hide the failure from the admin console", async () => {
        const { utils } = makeUtils({ failTemplateRead: true });

        await expect(utils.listTemplates()).rejects.toThrow("db down");
        await expect(utils.getTemplate("login-otp")).rejects.toThrow("db down");
    });

    it("says so when it has no object factory for the admin console", async () => {
        const { utils } = makeUtils({ withoutObjectFactory: true });

        await expect(utils.getTemplate("login-otp")).rejects.toThrow("objectFactory is not set.");
    });
});

describe("the admin console", () => {
    it("lists every template but `from`, and skips a config entry that isn't a template", async () => {
        const { utils } = makeUtils({
            templates: { ...structuredClone(TEMPLATES), notATemplate: "just a string" as any, alsoNot: null as any },
            rows: { "register-otp": { uid: "register-otp", subject: "Edited" } },
        });

        expect(utils.getTemplateNames()).toEqual(["login-otp", "register-otp"]);
        expect(await utils.listTemplates()).toEqual([
            { name: "login-otp", description: "Sign in.", customized: false, enabled: true },
            { name: "register-otp", description: undefined, customized: true, enabled: true },
        ]);
    });

    it("gets a template with its defaults and which parts are edited", async () => {
        const { utils } = makeUtils({ rows: { "login-otp": { uid: "login-otp", subject: "Edited" } } });

        const detail = await utils.getTemplate("login-otp");

        expect(detail.subject).toBe("Edited");
        expect(detail.defaults.subject).toBe("Your {{{brand.name}}} code");
        expect(detail.overridden).toMatchObject({ subject: true, text: false });
    });

    it("404s for a name that isn't a template, and for `from`", async () => {
        const { utils } = makeUtils();

        for (const name of ["nope", "from"]) {
            await expect(utils.getTemplate(name)).rejects.toMatchObject({ status: 404 });
            await expect(utils.updateTemplate(name, { subject: "x" })).rejects.toMatchObject({ status: 404 });
            await expect(utils.resetTemplate(name)).rejects.toMatchObject({ status: 404 });
            await expect(utils.previewTemplate(name, {})).rejects.toMatchObject({ status: 404 });
        }
    });

    describe("updating", () => {
        it("creates the edit the first time, under the template's own name", async () => {
            const { utils, templateRepo } = makeUtils();

            const detail = await utils.updateTemplate("login-otp", { subject: "New {{totp}}" });

            expect(templateRepo.create).toHaveBeenCalledWith(
                {
                    uid: "login-otp",
                    enabled: null,
                    subject: "New {{totp}}",
                    text: null,
                    html: null,
                    sms: null,
                    whatsapp: null,
                    whatsappTemplateName: null,
                    whatsappTemplateLanguage: null,
                    whatsappTemplateParameters: null,
                },
                { ignoreACL: true },
            );
            expect(detail).toMatchObject({ customized: true, subject: "New {{totp}}" });
            expect(detail.overridden.subject).toBe(true);
        });

        it("updates the existing edit afterwards, leaving parts that weren't sent as they were", async () => {
            const { utils, templateRepo } = makeUtils({ rows: { "login-otp": { uid: "login-otp", version: 3, subject: "Old", sms: "Old sms {{totp}}" } } });

            const detail = await utils.updateTemplate("login-otp", { subject: "Newer" });

            expect(templateRepo.create).not.toHaveBeenCalled();
            const [saved, existing, options] = templateRepo.update.mock.calls[0] as any[];
            expect(saved).toBeInstanceOf(FakeTemplate);
            expect(saved).toMatchObject({ uid: "login-otp", subject: "Newer", sms: "Old sms {{totp}}", text: null });
            expect(existing.version).toBe(3);
            expect(options).toEqual({ ignoreACL: true });
            expect(detail.overridden).toMatchObject({ subject: true, sms: true, text: false });
        });

        it("stores a part that matches the default as 'not edited', so it keeps following the default", async () => {
            const { utils, templateRepo } = makeUtils();

            const detail = await utils.updateTemplate("login-otp", { subject: TEMPLATES["login-otp"].subject, sms: "Different {{totp}}", enabled: true });

            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({ subject: null, enabled: null, sms: "Different {{totp}}" });
            expect(detail.overridden).toMatchObject({ subject: false, enabled: false, sms: true });
        });

        it("clears a part with null", async () => {
            const { utils, templateRepo } = makeUtils({ rows: { "login-otp": { uid: "login-otp", version: 0, subject: "Old", sms: "Kept {{totp}}" } } });

            await utils.updateTemplate("login-otp", { subject: null });

            expect(templateRepo.update.mock.calls[0][0]).toMatchObject({ subject: null, sms: "Kept {{totp}}" });
        });

        it("can disable a template, and enable it again", async () => {
            const { utils, templateRepo, rows } = makeUtils();

            const off = await utils.updateTemplate("login-otp", { enabled: false });
            expect(off).toMatchObject({ enabled: false, customized: true });

            const on = await utils.updateTemplate("login-otp", { enabled: true });
            expect(on).toMatchObject({ enabled: true, customized: false });
            expect(rows.has("login-otp")).toBe(false);
            expect(templateRepo.delete).toHaveBeenCalledWith("login-otp", { ignoreACL: true, purge: true });
        });

        it("removes the row when nothing is left edited, and doesn't try to when there never was one", async () => {
            const withRow = makeUtils({ rows: { "login-otp": { uid: "login-otp", version: 0, subject: "Old" } } });
            const detail = await withRow.utils.updateTemplate("login-otp", { subject: null });
            expect(withRow.templateRepo.delete).toHaveBeenCalledTimes(1);
            expect(detail.customized).toBe(false);

            const without = makeUtils();
            await without.utils.updateTemplate("login-otp", { subject: null });
            expect(without.templateRepo.delete).not.toHaveBeenCalled();
            expect(without.templateRepo.create).not.toHaveBeenCalled();
        });

        it("refuses an edit that doesn't render, and saves nothing", async () => {
            const { utils, templateRepo } = makeUtils();

            await expect(utils.updateTemplate("login-otp", { text: "{{#if totp}}unclosed" })).rejects.toMatchObject({
                status: 400,
                message: expect.stringContaining("This template can't be rendered"),
            });
            expect(templateRepo.create).not.toHaveBeenCalled();
            expect(templateRepo.update).not.toHaveBeenCalled();
        });

        it("refuses values of the wrong type, and ones that are too long", async () => {
            const { utils } = makeUtils();

            await expect(utils.updateTemplate("login-otp", { enabled: "yes" as any })).rejects.toMatchObject({ status: 400 });
            await expect(utils.updateTemplate("login-otp", { subject: 5 as any })).rejects.toMatchObject({
                status: 400,
                message: expect.stringContaining("`subject` must be a string or null."),
            });
            await expect(utils.updateTemplate("login-otp", { html: "x".repeat(100_001) })).rejects.toMatchObject({ status: 413 });
        });

        it("treats a missing body as no changes", async () => {
            const { utils } = makeUtils();

            await expect(utils.updateTemplate("login-otp", undefined as any)).resolves.toMatchObject({ customized: false });
        });

        it("stores an edited free-form WhatsApp message, and an emptied one as deliberate", async () => {
            const { utils, templateRepo } = makeUtils();

            const detail = await utils.updateTemplate("login-otp", { whatsapp: "New {{totp}}" });
            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({ whatsapp: "New {{totp}}", whatsappTemplateName: null });
            expect(detail).toMatchObject({ whatsapp: "New {{totp}}", customized: true });
            expect(detail.overridden.whatsapp).toBe(true);

            const emptied = await utils.updateTemplate("login-otp", { whatsapp: "" });
            expect(templateRepo.update.mock.calls[0][0]).toMatchObject({ whatsapp: "" });
            expect(emptied.overridden.whatsapp).toBe(true);
        });

        it("stores an approved WhatsApp template as its three flattened parts", async () => {
            const { utils, templateRepo } = makeUtils();

            const detail = await utils.updateTemplate("login-otp", {
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });

            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
                whatsapp: null,
            });
            expect(detail).toMatchObject({
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });
            expect(detail.overridden).toMatchObject({ whatsappTemplateName: true, whatsappTemplateLanguage: true, whatsappTemplateParameters: true, whatsapp: false });
        });

        it("stores a WhatsApp part that matches the default as 'not edited', so it keeps following the default", async () => {
            const { utils, templateRepo } = makeUtils({ templates: templatesWithWhatsAppTemplate() });

            const detail = await utils.updateTemplate("login-otp", {
                whatsapp: TEMPLATES["login-otp"].whatsapp,
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
                sms: "Different {{totp}}",
            });

            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({
                whatsapp: null,
                whatsappTemplateName: null,
                whatsappTemplateLanguage: null,
                whatsappTemplateParameters: null,
                sms: "Different {{totp}}",
            });
            expect(detail.overridden).toMatchObject({
                whatsapp: false,
                whatsappTemplateName: false,
                whatsappTemplateLanguage: false,
                whatsappTemplateParameters: false,
                sms: true,
            });
        });

        it("removes the row when the only WhatsApp edits left are ones that match the default", async () => {
            const { utils, templateRepo, rows } = makeUtils({
                templates: templatesWithWhatsAppTemplate(),
                rows: { "login-otp": { uid: "login-otp", version: 0, whatsappTemplateLanguage: "en_GB" } },
            });

            const detail = await utils.updateTemplate("login-otp", { whatsappTemplateLanguage: "en_US" });

            expect(templateRepo.delete).toHaveBeenCalledTimes(1);
            expect(rows.has("login-otp")).toBe(false);
            expect(detail).toMatchObject({ customized: false, whatsappTemplateLanguage: "en_US" });
        });

        it("edits one part of the config's WhatsApp template and keeps following the rest of it", async () => {
            const { utils, templateRepo } = makeUtils({ templates: templatesWithWhatsAppTemplate() });

            const detail = await utils.updateTemplate("login-otp", { whatsappTemplateLanguage: "en_GB" });

            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({
                whatsappTemplateName: null,
                whatsappTemplateLanguage: "en_GB",
                whatsappTemplateParameters: null,
            });
            expect(detail).toMatchObject({ whatsappTemplateName: "login_code", whatsappTemplateLanguage: "en_GB", whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}" });
            expect(detail.overridden).toMatchObject({ whatsappTemplateName: false, whatsappTemplateLanguage: true, whatsappTemplateParameters: false });
        });

        it("switches back to the free-form message when the template name is emptied", async () => {
            const { utils, templateRepo } = makeUtils({ templates: templatesWithWhatsAppTemplate() });

            const detail = await utils.updateTemplate("login-otp", { whatsappTemplateName: "" });

            expect(templateRepo.create.mock.calls[0][0]).toMatchObject({ whatsappTemplateName: "" });
            expect(detail.whatsappTemplateName).toBeUndefined();
            expect(detail.overridden.whatsappTemplateName).toBe(true);
            expect(detail.defaults.whatsappTemplateName).toBe("login_code");
            expect(detail.whatsapp).toBe(TEMPLATES["login-otp"].whatsapp);
        });

        it("clears a WhatsApp edit with null, and removes the row once nothing is left edited", async () => {
            const { utils, templateRepo, rows } = makeUtils({
                rows: { "login-otp": { uid: "login-otp", version: 0, whatsappTemplateName: "n", whatsappTemplateLanguage: "en" } },
            });

            await utils.updateTemplate("login-otp", { whatsappTemplateName: null });
            expect(templateRepo.update.mock.calls[0][0]).toMatchObject({ whatsappTemplateName: null, whatsappTemplateLanguage: "en" });

            const detail = await utils.updateTemplate("login-otp", { whatsappTemplateLanguage: null });
            expect(templateRepo.delete).toHaveBeenCalledTimes(1);
            expect(rows.has("login-otp")).toBe(false);
            expect(detail.customized).toBe(false);
        });

        it("refuses a WhatsApp template with no language, saving nothing", async () => {
            const { utils, templateRepo } = makeUtils();

            await expect(utils.updateTemplate("login-otp", { whatsappTemplateName: "login_code" })).rejects.toMatchObject({
                status: 400,
                message: expect.stringContaining("needs the language it was approved in"),
            });
            // Also when the language is emptied out from under a name that's already set.
            const withName = makeUtils({ templates: templatesWithWhatsAppTemplate() });
            await expect(withName.utils.updateTemplate("login-otp", { whatsappTemplateLanguage: "" })).rejects.toMatchObject({ status: 400 });
            expect(templateRepo.create).not.toHaveBeenCalled();
            expect(withName.templateRepo.create).not.toHaveBeenCalled();
        });

        it("refuses WhatsApp parameters that don't render, saving nothing", async () => {
            const { utils, templateRepo } = makeUtils({ templates: templatesWithWhatsAppTemplate() });

            await expect(utils.updateTemplate("login-otp", { whatsappTemplateParameters: "{{#if totp}}unclosed" })).rejects.toMatchObject({
                status: 400,
                message: expect.stringContaining("This template can't be rendered"),
            });
            expect(templateRepo.create).not.toHaveBeenCalled();

            // The free-form message is what's sent when there's no message template, so that's when it has to render.
            const freeForm = makeUtils();
            await expect(freeForm.utils.updateTemplate("login-otp", { whatsapp: "{{totp" })).rejects.toMatchObject({ status: 400 });
            expect(freeForm.templateRepo.create).not.toHaveBeenCalled();
        });

        it("refuses WhatsApp values of the wrong type, and ones that are too long", async () => {
            const { utils } = makeUtils();

            for (const field of ["whatsapp", "whatsappTemplateName", "whatsappTemplateLanguage", "whatsappTemplateParameters"]) {
                await expect(utils.updateTemplate("login-otp", { [field]: 5 }), field).rejects.toMatchObject({
                    status: 400,
                    message: expect.stringContaining(`\`${field}\` must be a string or null.`),
                });
                await expect(utils.updateTemplate("login-otp", { [field]: "x".repeat(100_001) }), field).rejects.toMatchObject({ status: 413 });
            }
        });
    });

    it("resets a template, discarding every edit", async () => {
        const { utils, templateRepo, rows } = makeUtils({ rows: { "login-otp": { uid: "login-otp", subject: "Old" } } });

        const detail = await utils.resetTemplate("login-otp");

        expect(rows.has("login-otp")).toBe(false);
        expect(templateRepo.delete).toHaveBeenCalledWith("login-otp", { ignoreACL: true, purge: true });
        expect(detail.customized).toBe(false);
    });

    it("resets a template that was never edited without touching the database", async () => {
        const { utils, templateRepo } = makeUtils();

        const detail = await utils.resetTemplate("login-otp");

        expect(templateRepo.delete).not.toHaveBeenCalled();
        expect(detail.customized).toBe(false);
    });

    describe("previewing", () => {
        it("renders the candidate with the real branding and a sample code, saving nothing", async () => {
            const { utils, templateRepo } = makeUtils({ settings: { companyName: "Acme" } });

            const rendered = await utils.previewTemplate("login-otp", { subject: "Preview for {{{brand.name}}}: {{totp}}" });

            expect(rendered).toEqual({
                subject: "Preview for Acme: 123456",
                text: "Acme: 123456",
                html: "<p>Acme 123456</p>",
                sms: "Acme: 123456",
                whatsapp: "Acme WhatsApp: 123456",
            });
            expect(templateRepo.create).not.toHaveBeenCalled();
            expect(templateRepo.update).not.toHaveBeenCalled();
        });

        it("previews a WhatsApp message as its text, and one sent as an approved template as its name, language and parameters", async () => {
            const text = makeUtils({ settings: { companyName: "Acme" } });
            expect((await text.utils.previewTemplate("login-otp", { whatsapp: "Edited {{{brand.name}}} {{totp}}" })).whatsapp).toBe("Edited Acme 123456");

            const template = makeUtils({ settings: { companyName: "Acme" } });
            const rendered = await template.utils.previewTemplate("login-otp", {
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });
            expect(rendered.whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 123456\n{{2}}: Acme');
            // The other channels are unaffected by it.
            expect(rendered).toMatchObject({ sms: "Acme: 123456", subject: "Your Acme code" });
        });

        it("previews a WhatsApp template the config sets, and the free-form message once its name is emptied", async () => {
            const { utils } = makeUtils({ templates: templatesWithWhatsAppTemplate() });

            expect((await utils.previewTemplate("login-otp", {})).whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 123456\n{{2}}: RapidREST');
            expect((await utils.previewTemplate("login-otp", { whatsappTemplateName: "" })).whatsapp).toBe("RapidREST WhatsApp: 123456");
            expect((await utils.previewTemplate("login-otp", { whatsappTemplateLanguage: "en_GB" })).whatsapp).toContain('(en_GB)');
        });

        it("previews nothing for WhatsApp when the message is emptied and there's no template", async () => {
            const { utils } = makeUtils();

            expect((await utils.previewTemplate("login-otp", { whatsapp: "" })).whatsapp).toBeNull();
            expect((await utils.previewTemplate("register-otp", {})).whatsapp).toBeNull();
        });

        it("refuses a WhatsApp template with no language, since WhatsApp can't send one", async () => {
            const { utils } = makeUtils();

            await expect(utils.previewTemplate("login-otp", { whatsappTemplateName: "login_code" })).rejects.toMatchObject({
                status: 400,
                message: expect.stringContaining("A WhatsApp template needs the language it was approved in"),
            });
        });

        it("refuses WhatsApp candidates of the wrong type, and ones that don't render", async () => {
            const { utils } = makeUtils();

            for (const field of ["whatsapp", "whatsappTemplateName", "whatsappTemplateLanguage", "whatsappTemplateParameters"]) {
                await expect(utils.previewTemplate("login-otp", { [field]: 1 }), field).rejects.toMatchObject({
                    status: 400,
                    message: expect.stringContaining(`\`${field}\` must be a string or null.`),
                });
            }
            await expect(utils.previewTemplate("login-otp", { whatsapp: "{{totp" })).rejects.toMatchObject({ status: 400 });
            await expect(
                utils.previewTemplate("login-otp", {
                    whatsappTemplateName: "n",
                    whatsappTemplateLanguage: "en",
                    whatsappTemplateParameters: "{{#if totp}}unclosed",
                }),
            ).rejects.toMatchObject({ status: 400 });
        });

        it("ignores what's saved, previewing the candidate over the default", async () => {
            const { utils } = makeUtils({ rows: { "login-otp": { uid: "login-otp", subject: "Saved" } } });

            expect((await utils.previewTemplate("login-otp", {})).subject).toBe("Your RapidREST code");
        });

        it("previews a disabled template", async () => {
            const { utils } = makeUtils();

            expect((await utils.previewTemplate("login-otp", { enabled: false })).subject).toBe("Your RapidREST code");
        });

        it("refuses a candidate that doesn't render, or that has the wrong type", async () => {
            const { utils } = makeUtils();

            await expect(utils.previewTemplate("login-otp", { sms: "{{totp" })).rejects.toMatchObject({ status: 400 });
            await expect(utils.previewTemplate("login-otp", { text: 1 as any })).rejects.toMatchObject({ status: 400 });
        });

        it("shows the wording when the message would render with something that isn't an Error thrown", async () => {
            const { utils } = makeUtils();
            const brandSpy = vi.spyOn(utils, "loadBrand").mockRejectedValueOnce("odd");

            await expect(utils.previewTemplate("login-otp", {})).rejects.toMatchObject({ status: 400, message: expect.stringContaining("odd") });
            brandSpy.mockRestore();
        });
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the sender addresses", () => {
    it("come from the settings the deployment's config seeded, on the first send", async () => {
        const { utils, sendMail, create, getMessagingRow } = makeUtils();

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await utils.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });

        expect(sendMail.mock.calls[0][0].from).toBe("no-reply@acme.test");
        expect(create.mock.calls[0][0].from).toBe("+15555550100");
        expect(getMessagingRow()).toMatchObject({ seeded: true, fromEmail: "no-reply@acme.test", fromSms: "+15555550100" });
    });

    it("use what an admin saved instead of config's, from the very next message", async () => {
        const { utils, sendMail, create, messagingRepo } = makeUtils({
            messagingRow: { uid: "default", version: 1, seeded: true, fromEmail: "saved@acme.test", fromSms: "Acme" },
        });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await utils.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });
        expect(sendMail.mock.calls[0][0].from).toBe("saved@acme.test");
        expect(create.mock.calls[0][0].from).toBe("Acme");

        messagingRepo.findOne.mockResolvedValue({ uid: "default", version: 2, seeded: true, fromEmail: "newer@acme.test", fromSms: "+15555550111" });
        await utils.sendEmail("login-otp", { totp: "2" }, SEND);
        await utils.sendSMS("login-otp", { totp: "2" }, { to: "+15555550123" });
        expect(sendMail.mock.calls[1][0].from).toBe("newer@acme.test");
        expect(create.mock.calls[1][0].from).toBe("+15555550111");
    });

    it("send nothing, saying so, once the admin has cleared them", async () => {
        const { utils, sendMail, create } = makeUtils({
            messagingRow: { uid: "default", version: 1, seeded: true, fromEmail: null, fromSms: null },
        });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await utils.sendSMS("login-otp", { totp: "1" }, { to: "+15555550123" });

        expect(sendMail).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("missing from.email"));
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("missing from.sms"));
    });

    it("aren't needed for WhatsApp, which is sent from the phone number ID, even once they're cleared", async () => {
        const { utils, postJson } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            messagingRow: {
                uid: "default",
                version: 1,
                seeded: true,
                fromEmail: null,
                fromSms: null,
                whatsappPhoneNumberId: PHONE_NUMBER_ID,
                whatsappAccessToken: encryptSecret("saved-wa-token", KEY),
            },
        });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, { to: "15555550123" });

        expect(postJson).toHaveBeenCalledTimes(1);
        expect(postJson.mock.calls[0][3]).not.toHaveProperty("from");
    });

    it("fall back to config when the settings can't be read", async () => {
        const { utils, sendMail } = makeUtils({ failMessagingRead: true });

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(sendMail.mock.calls[0][0].from).toBe("no-reply@acme.test");
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"));
    });
});

describe("the SMTP transport", () => {
    const CONFIG = { host: "smtp.config.test", port: 587, secure: false, auth: { user: "config-user", pass: "config-pass" } };
    const SEED = { uid: "default", version: 1, seeded: true, fromEmail: "no-reply@acme.test" };

    /** Replaces nodemailer with a fake that records what it was built from and sends through `sendMail`. */
    function fakeNodemailer(utils: any) {
        const sendMail = vi.fn().mockResolvedValue({ messageId: "m2" });
        const build = vi.spyOn(utils, "createSmtpTransport").mockImplementation(async (options: any) => ({ sendMail, builtFrom: options }));
        return { sendMail, build };
    }

    it("keeps the transport MessagingUtils already built from config, rather than building it again", async () => {
        const { utils, sendMail } = makeUtils({ smtpConfig: CONFIG });
        const { build } = fakeNodemailer(utils);

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(build).not.toHaveBeenCalled();
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("uses the settings an admin saved instead of config's, with config's other nodemailer options", async () => {
        const { utils, sendMail } = makeUtils({
            smtpConfig: { ...CONFIG, tls: { minVersion: "TLSv1.2" } },
            messagingRow: {
                ...SEED,
                smtpHost: "smtp.saved.test",
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: "saved-user",
                smtpPassword: encryptSecret("saved-pass", KEY),
            },
        });
        const { build, sendMail: newSendMail } = fakeNodemailer(utils);

        await utils.sendEmail("login-otp", { totp: "482913" }, SEND);

        expect(build).toHaveBeenCalledWith({
            tls: { minVersion: "TLSv1.2" },
            host: "smtp.saved.test",
            port: 465,
            secure: true,
            auth: { user: "saved-user", pass: "saved-pass" },
        });
        expect(utils.smtpConfig).toMatchObject({ host: "smtp.saved.test" });
        expect(newSendMail).toHaveBeenCalledTimes(1);
        expect(sendMail).not.toHaveBeenCalled();
    });

    it("works with nothing in config at all, so the database is the only place it's set", async () => {
        const { utils } = makeUtils({ messagingRow: { ...SEED, smtpHost: "smtp.saved.test" } });
        const { build, sendMail } = fakeNodemailer(utils);

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);

        expect(build).toHaveBeenCalledWith({ host: "smtp.saved.test" });
        expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it("builds the transport once, and again only when the settings change", async () => {
        const { utils, messagingRepo } = makeUtils({ messagingRow: { ...SEED, smtpHost: "one.test" } });
        const { build } = fakeNodemailer(utils);

        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await utils.sendEmail("login-otp", { totp: "2" }, SEND);
        expect(build).toHaveBeenCalledTimes(1);

        // A rotated password saved between two e-mails is used by the next one — no restart.
        messagingRepo.findOne.mockResolvedValue({ ...SEED, smtpHost: "one.test", smtpUser: "u", smtpPassword: encryptSecret("rotated", KEY) });
        await utils.sendEmail("login-otp", { totp: "3" }, SEND);
        await utils.sendEmail("login-otp", { totp: "4" }, SEND);

        expect(build).toHaveBeenCalledTimes(2);
        expect(build).toHaveBeenLastCalledWith({ host: "one.test", auth: { user: "u", pass: "rotated" } });
    });

    it("stops sending, without going back to config, once the host is cleared", async () => {
        const { utils, sendMail, messagingRepo } = makeUtils({ smtpConfig: CONFIG });
        fakeNodemailer(utils);
        await utils.sendEmail("login-otp", { totp: "1" }, SEND);
        expect(sendMail).toHaveBeenCalledTimes(1);

        messagingRepo.findOne.mockResolvedValue({ ...SEED, smtpHost: null });

        await expect(utils.sendEmail("login-otp", { totp: "2" }, SEND)).rejects.toThrow("E-mail is not configured.");
    });

    it("leaves e-mail unconfigured, saying why, when nodemailer rejects the settings — and doesn't retry until they change", async () => {
        const { utils, messagingRepo } = makeUtils({ messagingRow: { ...SEED, smtpHost: "bad.test" } });
        const build = vi.spyOn(utils, "createSmtpTransport").mockRejectedValue(new Error("bad options"));

        await expect(utils.sendEmail("login-otp", { totp: "1" }, SEND)).rejects.toThrow("E-mail is not configured.");
        await expect(utils.sendEmail("login-otp", { totp: "2" }, SEND)).rejects.toThrow("E-mail is not configured.");
        expect(build).toHaveBeenCalledTimes(1);
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to set up e-mail with the current settings"));

        messagingRepo.findOne.mockResolvedValue({ ...SEED, smtpHost: "good.test" });
        build.mockResolvedValue({ sendMail: vi.fn().mockResolvedValue({}) });
        await expect(utils.sendEmail("login-otp", { totp: "3" }, SEND)).resolves.toBeDefined();
        expect(build).toHaveBeenCalledTimes(2);
    });

    it("builds a real nodemailer transport from valid settings, without touching the network", async () => {
        const { utils } = makeUtils();

        const transport = await (utils).createSmtpTransport({ host: "smtp.acme.test", port: 587 });

        expect(typeof (transport).sendMail).toBe("function");
        (transport).close?.();
    });
});

describe("the SMS provider", () => {
    const TWILIO_CONFIG = { provider: "twilio", config: { accountSid: OTHER_SID, token: "config-token", options: { region: "au1" } } };
    const TELNYX_CONFIG = { provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } };
    const SMS = { to: "+15555550123" };
    const SEED = { uid: "default", version: 1, seeded: true, fromSms: "+15555550100" };
    const TELNYX_URL = "https://api.telnyx.com/v2/messages";
    const NOT_CONFIGURED = "SMS is not configured.";

    /** A saved row that sends through Twilio, with the token encrypted as the admin console would store it. */
    function saved(sid: string | null, token: string | null, key = KEY) {
        return { ...SEED, smsProvider: "twilio", twilioAccountSid: sid, twilioToken: token === null ? null : encryptSecret(token, key) };
    }

    /** A saved row that sends through Telnyx, with the API key encrypted as the admin console would store it. */
    function savedTelnyx(apiKey: string | null, messagingProfileId: string | null = null, key = KEY) {
        return {
            ...SEED,
            smsProvider: "telnyx",
            telnyxApiKey: apiKey === null ? null : encryptSecret(apiKey, key),
            telnyxMessagingProfileId: messagingProfileId,
        };
    }

    /** Replaces the SDK with a fake that records what it was built from and sends through `sent`. */
    function fakeSdk(utils: any) {
        const sent = vi.fn().mockResolvedValue({ sid: "SM1" });
        const build = vi.spyOn(utils, "createTwilioClient").mockImplementation(async (credentials: any) => ({
            messages: { create: sent },
            builtFrom: credentials,
        }));
        return { sent, build };
    }

    describe("Twilio", () => {
        it("keeps the client MessagingUtils already built from config, rather than building it again", async () => {
            const { utils, create } = makeUtils({ smsConfig: TWILIO_CONFIG });
            const { build } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(build).not.toHaveBeenCalled();
            expect(create).toHaveBeenCalledTimes(1);
        });

        it("uses the credentials saved in the database instead of config's, with config's SDK options", async () => {
            const { utils } = makeUtils({ smsConfig: TWILIO_CONFIG, messagingRow: saved(SID, "saved-token") });
            const { build, sent } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "482913" }, SMS);

            expect(build).toHaveBeenCalledTimes(1);
            expect(build).toHaveBeenCalledWith({ accountSid: SID, token: "saved-token", options: { region: "au1" } });
            expect(sent).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "+15555550100", body: "RapidREST: 482913" }));
            expect(utils.smsConfig).toEqual({ provider: "twilio", config: { accountSid: SID, token: "saved-token", options: { region: "au1" } } });
            expect(utils.telnyx).toBeUndefined();
        });

        it("works with nothing in config at all, so the database is the only place they're set", async () => {
            const { utils } = makeUtils({ smsConfig: null, messagingRow: saved(SID, "saved-token") });
            const { build, sent } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(build).toHaveBeenCalledWith({ accountSid: SID, token: "saved-token", options: undefined });
            expect(sent).toHaveBeenCalledTimes(1);
        });

        it("builds the client once, and again only when the credentials change", async () => {
            const { utils, messagingRepo } = makeUtils({ smsConfig: null, messagingRow: saved(SID, "first") });
            const { build } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);
            await utils.sendSMS("login-otp", { totp: "2" }, SMS);
            expect(build).toHaveBeenCalledTimes(1);

            // A rotated token, saved between two texts, is used by the next one — no restart.
            messagingRepo.findOne.mockResolvedValue(saved(SID, "rotated"));
            await utils.sendSMS("login-otp", { totp: "3" }, SMS);
            await utils.sendSMS("login-otp", { totp: "4" }, SMS);

            expect(build).toHaveBeenCalledTimes(2);
            expect(build).toHaveBeenLastCalledWith(expect.objectContaining({ token: "rotated" }));
        });

        it("stops sending, without going back to config, once the credentials are cleared", async () => {
            const { utils, messagingRepo, create } = makeUtils({ smsConfig: TWILIO_CONFIG, messagingRow: saved(SID, "saved-token") });
            const { sent } = fakeSdk(utils);
            await utils.sendSMS("login-otp", { totp: "1" }, SMS);
            expect(sent).toHaveBeenCalledTimes(1);

            messagingRepo.findOne.mockResolvedValue(saved(null, null));

            await expect(utils.sendSMS("login-otp", { totp: "2" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            expect(create).not.toHaveBeenCalled();
            expect(utils.twilio).toBeUndefined();
            expect(utils.smsConfig).toBeNull();
        });

        it("reports SMS as not configured when there are no credentials anywhere", async () => {
            const { utils } = makeUtils({ smsConfig: null });

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
        });

        it("needs both a SID and a token: half a set of credentials is none", async () => {
            for (const row of [saved(SID, null), saved(null, "token")]) {
                const { utils } = makeUtils({ smsConfig: null, messagingRow: row });
                fakeSdk(utils);

                await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            }
        });

        it("uses config's token, saying why, when the saved one can't be decrypted (the encryption key changed)", async () => {
            const { utils } = makeUtils({
                smsConfig: { provider: "twilio", config: { ...TWILIO_CONFIG.config, accountSid: SID } },
                messagingRow: saved(SID, "saved-token", OTHER_KEY),
            });
            const { build } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            // Same credentials as the client MessagingUtils already built from config, so nothing to rebuild.
            expect(build).not.toHaveBeenCalled();
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"));
        });

        it("uses config, saying why, when the settings can't be read", async () => {
            const { utils, create } = makeUtils({ smsConfig: TWILIO_CONFIG, failMessagingRead: true });
            fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(create).toHaveBeenCalledTimes(1);
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"));
        });

        it("takes no SDK options from config when config names Telnyx, whichever provider the database names", async () => {
            const { utils } = makeUtils({ smsConfig: TELNYX_CONFIG, messagingRow: saved(SID, "saved-token") });
            const { build } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(build).toHaveBeenCalledWith({ accountSid: SID, token: "saved-token", options: undefined });
            // The Telnyx settings config's init left behind are gone: only Twilio is in use now.
            expect(utils.telnyx).toBeUndefined();
        });

        it("leaves SMS unconfigured, saying why, when the SDK rejects the credentials — and doesn't retry until they change", async () => {
            const { utils, messagingRepo } = makeUtils({ smsConfig: null, messagingRow: saved(SID, "bad") });
            const build = vi.spyOn(utils, "createTwilioClient").mockRejectedValue(new Error("accountSid must start with AC"));

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            await expect(utils.sendSMS("login-otp", { totp: "2" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            expect(build).toHaveBeenCalledTimes(1);
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to set up SMS with the current settings"));
            expect(utils.twilio).toBeUndefined();
            expect(utils.telnyx).toBeUndefined();
            expect(utils.smsConfig).toBeNull();

            messagingRepo.findOne.mockResolvedValue(saved(SID, "fixed"));
            build.mockResolvedValue({ messages: { create: vi.fn().mockResolvedValue({}) } });
            await expect(utils.sendSMS("login-otp", { totp: "3" }, SMS)).resolves.toBeDefined();
            expect(build).toHaveBeenCalledTimes(2);
        });

        it("builds a real Twilio client from valid credentials, without touching the network", async () => {
            const { utils } = makeUtils();

            const client = await utils.createTwilioClient({ accountSid: SID, token: "saved-token" });

            // The real SDK: built, and able to send, without anything having been sent.
            expect(client.constructor.name).toBe("Twilio");
            expect(typeof client.messages.create).toBe("function");
        });

        it("has the SDK refuse a malformed account SID, which is why the console checks it before saving", async () => {
            const { utils } = makeUtils();

            await expect(utils.createTwilioClient({ accountSid: "not-a-sid", token: "t" })).rejects.toThrow();
        });
    });

    describe("Telnyx", () => {
        it("sends through Telnyx from the credentials in config, with the request MessagingUtils builds, and never through Twilio", async () => {
            const { utils, postJson, create } = makeUtils({ smsConfig: TELNYX_CONFIG });
            postJson.mockResolvedValue({ data: { id: "msg-1" } });
            const build = vi.spyOn(utils, "createTwilioClient");

            const result = await utils.sendSMS("login-otp", { totp: "482913" }, SMS);

            expect(result).toEqual({ id: "msg-1" });
            expect(postJson).toHaveBeenCalledTimes(1);
            const [provider, url, token, body] = postJson.mock.calls[0];
            expect(provider).toBe("Telnyx");
            expect(url).toBe(TELNYX_URL);
            expect(token).toBe("config-telnyx-key");
            expect(body).toEqual({
                messaging_profile_id: PROFILE_ID,
                to: "+15555550123",
                from: "+15555550100",
                text: "RapidREST: 482913",
            });
            expect(create).not.toHaveBeenCalled();
            expect(build).not.toHaveBeenCalled();
            expect(utils.twilio).toBeUndefined();
        });

        it("uses the credentials saved in the database instead of config's", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: TELNYX_CONFIG, messagingRow: savedTelnyx("saved-telnyx-key", "saved-profile") });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            const [, url, token, body] = postJson.mock.calls[0];
            expect(url).toBe(TELNYX_URL);
            expect(token).toBe("saved-telnyx-key");
            expect(body.messaging_profile_id).toBe("saved-profile");
            expect(utils.telnyx).toEqual({ apiKey: "saved-telnyx-key", messagingProfileId: "saved-profile" });
            expect(utils.smsConfig).toEqual({ provider: "telnyx", config: { apiKey: "saved-telnyx-key", messagingProfileId: "saved-profile" } });
            expect(utils.twilio).toBeUndefined();
        });

        it("works with nothing in config at all, without a messaging profile, so the database is the only place it's set", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: null, messagingRow: savedTelnyx("saved-telnyx-key") });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(postJson.mock.calls[0][2]).toBe("saved-telnyx-key");
            expect(postJson.mock.calls[0][3]).not.toHaveProperty("messaging_profile_id");
            expect(utils.telnyx).toEqual({ apiKey: "saved-telnyx-key" });
        });

        it("infers Telnyx for a saved row that names no provider but has only Telnyx credentials", async () => {
            const { utils, postJson, create } = makeUtils({ smsConfig: null, messagingRow: { ...savedTelnyx("saved-telnyx-key"), smsProvider: null } });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(postJson).toHaveBeenCalledTimes(1);
            expect(create).not.toHaveBeenCalled();
        });

        it("infers Twilio, not Telnyx, for a saved row that names no provider but has credentials for both", async () => {
            const { utils, postJson } = makeUtils({
                smsConfig: null,
                messagingRow: { ...saved(SID, "saved-token"), smsProvider: null, telnyxApiKey: encryptSecret("saved-telnyx-key", KEY) },
            });
            const { sent } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(sent).toHaveBeenCalledTimes(1);
            expect(postJson).not.toHaveBeenCalled();
        });

        it("picks up a rotated API key, or a changed messaging profile, with the very next text", async () => {
            const { utils, postJson, messagingRepo } = makeUtils({ smsConfig: null, messagingRow: savedTelnyx("first", PROFILE_ID) });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);
            messagingRepo.findOne.mockResolvedValue(savedTelnyx("rotated", "other-profile"));
            await utils.sendSMS("login-otp", { totp: "2" }, SMS);

            expect(postJson.mock.calls.map(([, , token, body]) => [token, body.messaging_profile_id])).toEqual([
                ["first", PROFILE_ID],
                ["rotated", "other-profile"],
            ]);
        });

        it("stops sending, without going back to config, once the API key is cleared", async () => {
            const { utils, postJson, messagingRepo } = makeUtils({ smsConfig: TELNYX_CONFIG });
            await utils.sendSMS("login-otp", { totp: "1" }, SMS);
            expect(postJson).toHaveBeenCalledTimes(1);

            messagingRepo.findOne.mockResolvedValue(savedTelnyx(null, PROFILE_ID));

            await expect(utils.sendSMS("login-otp", { totp: "2" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            expect(postJson).toHaveBeenCalledTimes(1);
            expect(utils.telnyx).toBeUndefined();
        });

        it("uses config's API key, saying why, when the saved one can't be decrypted (the encryption key changed)", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: TELNYX_CONFIG, messagingRow: savedTelnyx("saved-telnyx-key", PROFILE_ID, OTHER_KEY) });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(postJson.mock.calls[0][2]).toBe("config-telnyx-key");
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"));
        });

        it("has no API key at all when the saved one can't be decrypted and config names Twilio, not Telnyx", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: TWILIO_CONFIG, messagingRow: savedTelnyx("saved-telnyx-key", null, OTHER_KEY) });

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(NOT_CONFIGURED);
            expect(postJson).not.toHaveBeenCalled();
        });

        it("uses config, saying why, when the settings can't be read", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: TELNYX_CONFIG, failMessagingRead: true });

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(postJson.mock.calls[0][2]).toBe("config-telnyx-key");
            expect(postJson.mock.calls[0][3].from).toBe("+15555550100");
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"));
        });

        it("doesn't send a text without a from number, saying so", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: null, messagingRow: { ...savedTelnyx("saved-telnyx-key"), fromSms: null } });

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).resolves.toBeUndefined();

            expect(postJson).not.toHaveBeenCalled();
            expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("missing from.sms"));
        });

        it("doesn't let a caller's options override the sender or the rendered text", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: TELNYX_CONFIG });

            await utils.sendSMS("login-otp", { totp: "1" }, { ...SMS, from: "+19999999999", text: "spoofed", messaging_profile_id: "spoofed" });

            expect(postJson.mock.calls[0][3]).toMatchObject({ from: "+15555550100", text: "RapidREST: 1", messaging_profile_id: "spoofed" });
        });

        it("sends the request through axios with the API key as a bearer token, when nothing stands in for it", async () => {
            const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { data: { id: "msg-2" } } });
            const { utils } = makeUtils({ smsConfig: TELNYX_CONFIG, realPostJson: true });

            const result = await utils.sendSMS("login-otp", { totp: "482913" }, SMS);

            expect(result).toEqual({ id: "msg-2" });
            expect(post).toHaveBeenCalledTimes(1);
            const [url, body, requestConfig] = post.mock.calls[0] as any[];
            expect(url).toBe(TELNYX_URL);
            expect(body).toMatchObject({ to: "+15555550123", from: "+15555550100", text: "RapidREST: 482913", messaging_profile_id: PROFILE_ID });
            expect(requestConfig.headers.Authorization).toBe("Bearer config-telnyx-key");
        });

        it("reports why Telnyx refused a text, from the body of its response", async () => {
            vi.spyOn(axios, "post").mockRejectedValue({
                message: "Request failed with status code 422",
                response: { status: 422, data: { errors: [{ title: "Invalid", detail: "The 'from' number is not owned by this account." }] } },
            });
            const { utils } = makeUtils({ smsConfig: TELNYX_CONFIG, realPostJson: true });

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(
                "Telnyx request failed (422): The 'from' number is not owned by this account.",
            );
        });
    });

    describe("switching between them", () => {
        const BOTH = {
            ...SEED,
            smsProvider: "twilio",
            twilioAccountSid: SID,
            twilioToken: encryptSecret("saved-token", KEY),
            telnyxApiKey: encryptSecret("saved-telnyx-key", KEY),
            telnyxMessagingProfileId: PROFILE_ID,
        };

        it("sends through only the chosen provider, whichever is chosen, and keeps the other's saved values for switching back", async () => {
            const { utils, postJson, getMessagingRow } = makeUtils({ smsConfig: null, messagingRow: BOTH });
            const { sent, build } = fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);
            expect(sent).toHaveBeenCalledTimes(1);
            expect(postJson).not.toHaveBeenCalled();
            expect(utils.twilio).toBeDefined();
            expect(utils.telnyx).toBeUndefined();

            // The admin picks Telnyx in the console: only that provider is in use from the next text, and Twilio's client is gone.
            await utils.updateSmsSettings({ provider: "telnyx" });
            await utils.sendSMS("login-otp", { totp: "2" }, SMS);
            expect(postJson).toHaveBeenCalledTimes(1);
            expect(postJson.mock.calls[0][2]).toBe("saved-telnyx-key");
            expect(sent).toHaveBeenCalledTimes(1);
            expect(utils.twilio).toBeUndefined();
            expect(utils.telnyx).toEqual({ apiKey: "saved-telnyx-key", messagingProfileId: PROFILE_ID });
            expect(utils.smsConfig.provider).toBe("telnyx");
            // Twilio's saved values are kept, just unused.
            expect(getMessagingRow()).toMatchObject({ twilioAccountSid: SID, twilioToken: BOTH.twilioToken });

            // And back again: Twilio's client is built afresh from what was kept, and Telnyx's settings are cleared.
            await utils.updateSmsSettings({ provider: "twilio" });
            await utils.sendSMS("login-otp", { totp: "3" }, SMS);
            expect(sent).toHaveBeenCalledTimes(2);
            expect(postJson).toHaveBeenCalledTimes(1);
            expect(build).toHaveBeenCalledTimes(2);
            expect(build).toHaveBeenLastCalledWith({ accountSid: SID, token: "saved-token", options: undefined });
            expect(utils.twilio).toBeDefined();
            expect(utils.telnyx).toBeUndefined();
            expect(utils.smsConfig.provider).toBe("twilio");
            expect(getMessagingRow()).toMatchObject({ telnyxApiKey: BOTH.telnyxApiKey, telnyxMessagingProfileId: PROFILE_ID });
        });

        it("doesn't fall through to the other provider when the chosen one has no credentials, however complete the other's are", async () => {
            const { utils, postJson } = makeUtils({ smsConfig: null, messagingRow: { ...BOTH, smsProvider: "telnyx", telnyxApiKey: null } });
            const { sent } = fakeSdk(utils);

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow(NOT_CONFIGURED);

            expect(sent).not.toHaveBeenCalled();
            expect(postJson).not.toHaveBeenCalled();
            expect(utils.twilio).toBeUndefined();
            expect(utils.telnyx).toBeUndefined();
        });

        it("has the provider config's init set up replaced by the one the database names", async () => {
            // init() built a Twilio client from config, but the admin has since chosen Telnyx.
            const { utils, postJson, create } = makeUtils({ smsConfig: TWILIO_CONFIG, messagingRow: { ...BOTH, smsProvider: "telnyx" } });
            fakeSdk(utils);

            await utils.sendSMS("login-otp", { totp: "1" }, SMS);

            expect(postJson).toHaveBeenCalledTimes(1);
            expect(create).not.toHaveBeenCalled();
            expect(utils.twilio).toBeUndefined();
        });

        it("refuses to choose a provider it doesn't know, saving nothing", async () => {
            const { utils, messagingRepo } = makeUtils({ smsConfig: null, messagingRow: BOTH });

            await expect(utils.updateSmsSettings({ provider: "vonage" })).rejects.toMatchObject({ status: 400 });

            expect(messagingRepo.update).not.toHaveBeenCalled();
        });
    });
});

describe("the WhatsApp credentials", () => {
    const TO = { to: "15555550123" };
    const SEED = { uid: "default", version: 1, seeded: true };

    /** A saved row's fields, with the access token encrypted as the admin console would store it. */
    function saved(phoneNumberId: string | null, token: string | null, apiVersion: string | null = null, key = KEY) {
        return {
            ...SEED,
            whatsappPhoneNumberId: phoneNumberId,
            whatsappAccessToken: token === null ? null : encryptSecret(token, key),
            whatsappApiVersion: apiVersion,
        };
    }

    it("sends with the credentials MessagingUtils already took from config", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson.mock.calls[0].slice(0, 3)).toEqual(["WhatsApp", `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, "config-wa-token"]);
        expect(utils.whatsapp).toEqual({ accessToken: "config-wa-token", phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v22.0" });
    });

    it("uses the credentials saved in the database instead of config's, and core's default API version when none is saved", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, messagingRow: saved(OTHER_PHONE_NUMBER_ID, "saved-wa-token") });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson.mock.calls[0].slice(0, 3)).toEqual(["WhatsApp", `https://graph.facebook.com/v23.0/${OTHER_PHONE_NUMBER_ID}/messages`, "saved-wa-token"]);
        expect(utils.whatsapp).toEqual({ accessToken: "saved-wa-token", phoneNumberId: OTHER_PHONE_NUMBER_ID });
    });

    it("uses the API version an admin saved", async () => {
        const { utils, postJson } = makeUtils({ messagingRow: saved(PHONE_NUMBER_ID, "saved-wa-token", "v19.0") });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson.mock.calls[0][1]).toBe(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`);
    });

    it("works with nothing in config at all, so the database is the only place they're set", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: null, messagingRow: saved(PHONE_NUMBER_ID, "saved-wa-token") });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson).toHaveBeenCalledTimes(1);
    });

    it("uses a rotated token, or a changed phone number, with the very next message", async () => {
        const { utils, postJson, messagingRepo } = makeUtils({ messagingRow: saved(PHONE_NUMBER_ID, "first") });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);
        messagingRepo.findOne.mockResolvedValue(saved(OTHER_PHONE_NUMBER_ID, "rotated"));
        await utils.sendWhatsApp("login-otp", { totp: "2" }, TO);

        expect(postJson.mock.calls.map(([, url, token]) => [url, token])).toEqual([
            [`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, "first"],
            [`https://graph.facebook.com/v23.0/${OTHER_PHONE_NUMBER_ID}/messages`, "rotated"],
        ]);
    });

    it("stops sending, without going back to config, once the credentials are cleared", async () => {
        const { utils, postJson, messagingRepo } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });
        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);
        expect(postJson).toHaveBeenCalledTimes(1);

        messagingRepo.findOne.mockResolvedValue(saved(null, null));

        await expect(utils.sendWhatsApp("login-otp", { totp: "2" }, TO)).rejects.toThrow("WhatsApp is not configured.");
        expect(postJson).toHaveBeenCalledTimes(1);
        expect(utils.whatsapp).toBeUndefined();
    });

    it("reports WhatsApp as not configured when there are no credentials anywhere", async () => {
        const { utils, postJson } = makeUtils();

        await expect(utils.sendWhatsApp("login-otp", { totp: "1" }, TO)).rejects.toThrow("WhatsApp is not configured.");
        expect(postJson).not.toHaveBeenCalled();
    });

    it("needs both an access token and a phone number ID: half a set of credentials is none", async () => {
        for (const row of [saved(PHONE_NUMBER_ID, null), saved(null, "token")]) {
            const { utils } = makeUtils({ messagingRow: row });

            await expect(utils.sendWhatsApp("login-otp", { totp: "1" }, TO)).rejects.toThrow("WhatsApp is not configured.");
        }
    });

    it("uses config's token, saying why, when the saved one can't be decrypted (the encryption key changed)", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, messagingRow: saved(PHONE_NUMBER_ID, "saved-wa-token", null, OTHER_KEY) });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson.mock.calls[0][2]).toBe("config-wa-token");
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"));
    });

    it("uses config, saying why, when the settings can't be read", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, failMessagingRead: true });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, TO);

        expect(postJson.mock.calls[0].slice(1, 3)).toEqual([`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, "config-wa-token"]);
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"));
    });

    it("is not configured, saying why, when the settings can't be read and config has none either", async () => {
        const { utils } = makeUtils({ failMessagingRead: true });

        await expect(utils.sendWhatsApp("login-otp", { totp: "1" }, TO)).rejects.toThrow("WhatsApp is not configured.");
    });

    it("doesn't let a caller's options override the message type or contents", async () => {
        const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, { ...TO, type: "template", text: { body: "spoofed" }, messaging_product: "sms" });

        expect(postJson.mock.calls[0][3]).toMatchObject({ messaging_product: "whatsapp", type: "text", text: { body: "RapidREST WhatsApp: 1" }, to: "15555550123" });
    });

    it("sends the request through axios with the access token as a bearer token, when nothing stands in for it", async () => {
        const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { messages: [{ id: "wamid.9" }] } });
        const { utils } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, realPostJson: true });

        const result = await utils.sendWhatsApp("login-otp", { totp: "482913" }, TO);

        expect(result).toEqual({ messages: [{ id: "wamid.9" }] });
        const [url, body, requestConfig] = post.mock.calls[0] as any[];
        expect(url).toBe(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`);
        expect(body).toMatchObject({ messaging_product: "whatsapp", to: "15555550123", type: "text", text: { body: "RapidREST WhatsApp: 482913" } });
        expect(requestConfig.headers.Authorization).toBe("Bearer config-wa-token");
    });

    it("sends an approved message template through axios, and reports why WhatsApp refused a message from its response", async () => {
        const post = vi.spyOn(axios, "post").mockRejectedValue({
            message: "Request failed with status code 400",
            response: { status: 400, data: { error: { message: "Invalid parameter", error_data: { details: "Template name does not exist in en_US" } } } },
        });
        const { utils } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, templates: templatesWithWhatsAppTemplate(), realPostJson: true });

        await expect(utils.sendWhatsApp("login-otp", { totp: "482913" }, TO)).rejects.toThrow(
            "WhatsApp request failed (400): Template name does not exist in en_US",
        );

        expect(post.mock.calls[0][1]).toMatchObject({
            type: "template",
            template: { name: "login_code", language: { code: "en_US" } },
        });
    });

    describe("isWhatsAppConfigured()", () => {
        it("is true when config has both an access token and a phone number ID", async () => {
            const { utils } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });

            expect(await utils.isWhatsAppConfigured()).toBe(true);
        });

        it("is true when only the database has them", async () => {
            const { utils } = makeUtils({ messagingRow: saved(PHONE_NUMBER_ID, "saved-wa-token") });

            expect(await utils.isWhatsAppConfigured()).toBe(true);
        });

        it("is false with credentials nowhere, and false with half of them", async () => {
            expect(await makeUtils().utils.isWhatsAppConfigured()).toBe(false);
            expect(await makeUtils({ whatsappConfig: { accessToken: "tok" } }).utils.isWhatsAppConfigured()).toBe(false);
            expect(await makeUtils({ whatsappConfig: { phoneNumberId: PHONE_NUMBER_ID } }).utils.isWhatsAppConfigured()).toBe(false);
            expect(await makeUtils({ messagingRow: saved(PHONE_NUMBER_ID, null) }).utils.isWhatsAppConfigured()).toBe(false);
            expect(await makeUtils({ messagingRow: saved(null, "tok") }).utils.isWhatsAppConfigured()).toBe(false);
        });

        it("follows the admin console without a restart or a send in between", async () => {
            const { utils } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });
            expect(await utils.isWhatsAppConfigured()).toBe(true);

            await utils.updateWhatsAppSettings({ accessToken: null });
            expect(await utils.isWhatsAppConfigured()).toBe(false);

            await utils.updateWhatsAppSettings({ accessToken: "new-token" });
            expect(await utils.isWhatsAppConfigured()).toBe(true);

            await utils.updateWhatsAppSettings({ phoneNumberId: null });
            expect(await utils.isWhatsAppConfigured()).toBe(false);

            await utils.resetWhatsAppSettings();
            expect(await utils.isWhatsAppConfigured()).toBe(true);
        });

        it("follows the database being changed underneath it", async () => {
            const { utils, messagingRepo } = makeUtils();
            expect(await utils.isWhatsAppConfigured()).toBe(false);

            messagingRepo.findOne.mockResolvedValue(saved(PHONE_NUMBER_ID, "tok"));
            expect(await utils.isWhatsAppConfigured()).toBe(true);
        });

        it("falls back to config when the settings can't be read, and never throws", async () => {
            expect(await makeUtils({ whatsappConfig: WHATSAPP_CONFIG, failMessagingRead: true }).utils.isWhatsAppConfigured()).toBe(true);
            expect(await makeUtils({ failMessagingRead: true }).utils.isWhatsAppConfigured()).toBe(false);
        });

        it("doesn't send anything, or need the credentials to decrypt to answer with config's", async () => {
            const { utils, postJson } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG, messagingRow: saved(PHONE_NUMBER_ID, "saved-wa-token", null, OTHER_KEY) });

            expect(await utils.isWhatsAppConfigured()).toBe(true);
            expect(postJson).not.toHaveBeenCalled();
        });
    });
});

describe("seeding as the server starts", () => {
    it("fills the settings from config, so the console shows them straight away", async () => {
        const { utils, getMessagingRow } = makeUtils({
            smsConfig: { provider: "twilio", config: { accountSid: SID, token: "config-token" } },
            whatsappConfig: WHATSAPP_CONFIG,
        });

        await utils.seedMessagingSettings();

        expect(getMessagingRow()).toMatchObject({
            seeded: true,
            smsProvider: "twilio",
            twilioAccountSid: SID,
            fromEmail: "no-reply@acme.test",
            whatsappPhoneNumberId: PHONE_NUMBER_ID,
            whatsappApiVersion: "v22.0",
        });
        expect(decryptSecret(getMessagingRow().twilioToken, KEY)).toBe("config-token");
        expect(decryptSecret(getMessagingRow().whatsappAccessToken, KEY)).toBe("config-wa-token");
    });

    it("seeds Telnyx as the provider from `sms_config`", async () => {
        const { utils, getMessagingRow } = makeUtils({
            smsConfig: { provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } },
        });

        await utils.seedMessagingSettings();

        expect(getMessagingRow()).toMatchObject({ seeded: true, smsProvider: "telnyx", telnyxMessagingProfileId: PROFILE_ID });
        expect(decryptSecret(getMessagingRow().telnyxApiKey, KEY)).toBe("config-telnyx-key");
        expect(getMessagingRow().twilioToken).toBeUndefined();
        expect(JSON.stringify(getMessagingRow())).not.toContain("config-telnyx-key");
    });

    it("must not stop the server when it can't, saying why: config applies until they are seeded", async () => {
        const { utils } = makeUtils({ failMessagingRead: true });

        await expect(utils.seedMessagingSettings()).resolves.toBeUndefined();

        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to seed the messaging settings"));
    });
});

describe("the admin console — transport settings", () => {
    const TWILIO = { provider: "twilio", config: { accountSid: SID, token: "config-token" } };

    it("reads and saves the SMS settings through the store, never returning the token", async () => {
        const { utils } = makeUtils({ smsConfig: TWILIO });

        expect(await utils.getSmsSettings()).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: true,
        });
        const updated = await utils.updateSmsSettings({ twilio: { token: "new-secret" }, from: "Acme" });

        expect(updated).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "Acme",
            configured: true,
        });
        expect(JSON.stringify(updated)).not.toContain("new-secret");
    });

    it("switches to Telnyx through the store, never returning its API key, and keeps Twilio's saved settings", async () => {
        const { utils, getMessagingRow } = makeUtils({ smsConfig: TWILIO });

        const updated = await utils.updateSmsSettings({ provider: "telnyx", telnyx: { apiKey: "new-telnyx-secret", messagingProfileId: PROFILE_ID } });

        expect(updated).toEqual({
            provider: "telnyx",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: true, messagingProfileId: PROFILE_ID },
            from: "+15555550100",
            configured: true,
        });
        expect(JSON.stringify(updated)).not.toContain("new-telnyx-secret");
        expect(getMessagingRow().telnyxApiKey).toMatch(/^enc:v1:/);
        expect(decryptSecret(getMessagingRow().telnyxApiKey, KEY)).toBe("new-telnyx-secret");
        expect(decryptSecret(getMessagingRow().twilioToken, KEY)).toBe("config-token");
    });

    it("reads and saves the WhatsApp settings through the store, never returning the access token", async () => {
        const { utils, getMessagingRow } = makeUtils({ whatsappConfig: WHATSAPP_CONFIG });

        expect(await utils.getWhatsAppSettings()).toEqual({ phoneNumberId: PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v22.0", configured: true });
        const updated = await utils.updateWhatsAppSettings({ accessToken: "new-wa-secret", phoneNumberId: OTHER_PHONE_NUMBER_ID, apiVersion: "v23.0" });

        expect(updated).toEqual({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v23.0", configured: true });
        expect(JSON.stringify(updated)).not.toContain("new-wa-secret");
        expect(decryptSecret(getMessagingRow().whatsappAccessToken, KEY)).toBe("new-wa-secret");
    });

    it("reads and saves the SMTP settings through the store, never returning the password", async () => {
        const { utils } = makeUtils({ smtpConfig: { host: "smtp.config.test", port: 587 } });

        expect(await utils.getSmtpSettings()).toMatchObject({ host: "smtp.config.test", port: 587, from: "no-reply@acme.test", configured: true });
        const updated = await utils.updateSmtpSettings({ host: "smtp.new.test", password: "new-secret" });

        expect(updated).toMatchObject({ host: "smtp.new.test", passwordSet: true });
        expect(JSON.stringify(updated)).not.toContain("new-secret");
    });

    it("puts each card's settings back to what config says, through the store", async () => {
        const { utils } = makeUtils({
            smsConfig: TWILIO,
            whatsappConfig: WHATSAPP_CONFIG,
            smtpConfig: { host: "smtp.config.test", port: 587 },
            messagingRow: {
                uid: "default",
                version: 1,
                seeded: true,
                smsProvider: "telnyx",
                twilioAccountSid: OTHER_SID,
                fromSms: "Changed",
                whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID,
                smtpHost: "changed.test",
                fromEmail: "changed@acme.test",
            },
        });

        const sms = await utils.resetSmsSettings();
        const whatsapp = await utils.resetWhatsAppSettings();
        const smtp = await utils.resetSmtpSettings();

        expect(sms).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: true,
        });
        expect(whatsapp).toEqual({ phoneNumberId: PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v22.0", configured: true });
        expect(smtp).toMatchObject({ host: "smtp.config.test", port: 587, from: "no-reply@acme.test", configured: true });
        expect(JSON.stringify([sms, whatsapp, smtp])).not.toMatch(/config-token|config-wa-token/);
    });

    it("has the next message use a reset without a restart", async () => {
        const { utils, postJson } = makeUtils({
            whatsappConfig: WHATSAPP_CONFIG,
            messagingRow: { uid: "default", version: 1, seeded: true, whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID, whatsappAccessToken: encryptSecret("changed", KEY) },
        });

        await utils.sendWhatsApp("login-otp", { totp: "1" }, { to: "1" });
        await utils.resetWhatsAppSettings();
        await utils.sendWhatsApp("login-otp", { totp: "2" }, { to: "1" });

        expect(postJson.mock.calls.map(([, url, token]) => [url, token])).toEqual([
            [`https://graph.facebook.com/v23.0/${OTHER_PHONE_NUMBER_ID}/messages`, "changed"],
            [`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, "config-wa-token"],
        ]);
    });

    it("refuses a bad value with a 400", async () => {
        const { utils } = makeUtils();

        await expect(utils.updateSmsSettings({ twilio: { accountSid: "nope" } })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateSmsSettings({ provider: "nope" })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateSmsSettings({ telnyx: { messagingProfileId: "bad id!" } })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateWhatsAppSettings({ phoneNumberId: "+15555550100" })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateWhatsAppSettings({ apiVersion: "23" })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateSmtpSettings({ host: "smtp://nope" })).rejects.toMatchObject({ status: 400 });
    });
});
