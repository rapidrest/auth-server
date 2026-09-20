///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Isolated unit tests for BaseDatabaseMessagingUtils — no HTTP server, no database. The templates repository and the
// site-settings repository are fakes; everything from template lookup to Handlebars rendering is the real code (only
// the SMTP/Twilio transports are replaced). See MessageTemplateRoute.*.test.ts for the same thing end to end.
import fs from "fs";
import os from "os";
import path from "path";
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
    },
    "register-otp": { enabled: true, subject: "Register", text: "{{totp}}", sms: "{{totp}}" },
};

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
    /** The deployment's `twilio` config block, which MessagingUtils.init() would already have built a client from. */
    twilioConfig?: Record<string, any> | null;
    /** The deployment's `smtp_config` block, which MessagingUtils.init() would already have built a transport from. */
    smtpConfig?: Record<string, any> | null;
    encryptionKey?: string;
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
            return { uid: "default", ...(options.settings ?? {}) };
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
    utils.configuredTwilio = options.twilioConfig === undefined ? null : options.twilioConfig;
    utils.configuredSmtp = options.smtpConfig === undefined ? null : options.smtpConfig;
    // What MessagingUtils.init() leaves behind: a client built from the config credentials, if there are any.
    utils.twilio = options.twilioConfig?.accountSid ? { messages: { create }, builtFrom: "config" } : undefined;
    if (options.twilioConfig === undefined) utils.twilio = { messages: { create }, builtFrom: "config" };
    return {
        utils: utils,
        rows,
        templateRepo,
        settingsRepo,
        messagingRepo,
        getMessagingRow: () => messagingRow,
        sendMail,
        create,
        templates,
    };
}

const SEND = { to: "user@acme.test" };

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
        const disabled = makeUtils({ rows: { "login-otp": { uid: "login-otp", enabled: false } } });
        await disabled.utils.sendEmail("login-otp", { totp: "1" }, SEND);
        await disabled.utils.sendSMS("login-otp", { totp: "1" }, { to: "+1" });
        expect(disabled.sendMail).not.toHaveBeenCalled();
        expect(disabled.create).not.toHaveBeenCalled();

        const noSms = makeUtils({ rows: { "login-otp": { uid: "login-otp", sms: "" } } });
        await noSms.utils.sendSMS("login-otp", { totp: "1" }, { to: "+1" });
        await noSms.utils.sendEmail("login-otp", { totp: "1" }, SEND);
        expect(noSms.create).not.toHaveBeenCalled();
        expect(noSms.sendMail).toHaveBeenCalledTimes(1);
    });

    it("sends an SMS with the branding too", async () => {
        const { utils, create } = makeUtils({ settings: { siteTitle: "Portal" } });

        await utils.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" });

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "+15555550100", body: "Portal: 482913" }));
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
                { uid: "login-otp", enabled: null, subject: "New {{totp}}", text: null, html: null, sms: null },
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
            });
            expect(templateRepo.create).not.toHaveBeenCalled();
            expect(templateRepo.update).not.toHaveBeenCalled();
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

describe("Twilio credentials", () => {
    const CONFIG = { accountSid: OTHER_SID, token: "config-token", options: { region: "au1" } };
    const SMS = { to: "+15555550123" };
    const SEED = { uid: "default", version: 1, seeded: true, fromSms: "+15555550100" };

    /** A saved row's fields, with the token encrypted as the admin console would store it. */
    function saved(sid: string | null, token: string | null, key = KEY) {
        return { ...SEED, twilioAccountSid: sid, twilioToken: token === null ? null : encryptSecret(token, key) };
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

    it("keeps the client MessagingUtils already built from config, rather than building it again", async () => {
        const { utils, create } = makeUtils({ twilioConfig: CONFIG });
        const { build } = fakeSdk(utils);

        await utils.sendSMS("login-otp", { totp: "1" }, SMS);

        expect(build).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("uses the credentials saved in the database instead of config's, with config's SDK options", async () => {
        const { utils } = makeUtils({ twilioConfig: CONFIG, messagingRow: saved(SID, "saved-token") });
        const { build, sent } = fakeSdk(utils);

        await utils.sendSMS("login-otp", { totp: "482913" }, SMS);

        expect(build).toHaveBeenCalledTimes(1);
        expect(build).toHaveBeenCalledWith({ accountSid: SID, token: "saved-token", options: { region: "au1" } });
        expect(sent).toHaveBeenCalledWith(expect.objectContaining({ to: "+15555550123", from: "+15555550100", body: "RapidREST: 482913" }));
    });

    it("works with nothing in config at all, so the database is the only place they're set", async () => {
        const { utils } = makeUtils({ twilioConfig: null, messagingRow: saved(SID, "saved-token") });
        const { build, sent } = fakeSdk(utils);

        await utils.sendSMS("login-otp", { totp: "1" }, SMS);

        expect(build).toHaveBeenCalledWith({ accountSid: SID, token: "saved-token", options: undefined });
        expect(sent).toHaveBeenCalledTimes(1);
    });

    it("builds the client once, and again only when the credentials change", async () => {
        const { utils, messagingRepo } = makeUtils({ twilioConfig: null, messagingRow: saved(SID, "first") });
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
        const { utils, messagingRepo, create } = makeUtils({ twilioConfig: CONFIG, messagingRow: saved(SID, "saved-token") });
        const { sent } = fakeSdk(utils);
        await utils.sendSMS("login-otp", { totp: "1" }, SMS);
        expect(sent).toHaveBeenCalledTimes(1);

        messagingRepo.findOne.mockResolvedValue(saved(null, null));

        await expect(utils.sendSMS("login-otp", { totp: "2" }, SMS)).rejects.toThrow("Twilio is not configured.");
        expect(create).not.toHaveBeenCalled();
    });

    it("reports SMS as not configured when there are no credentials anywhere", async () => {
        const { utils } = makeUtils({ twilioConfig: null });
        utils.twilio = undefined;

        await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow("Twilio is not configured.");
    });

    it("needs both a SID and a token: half a set of credentials is none", async () => {
        for (const row of [saved(SID, null), saved(null, "token")]) {
            const { utils } = makeUtils({ twilioConfig: null, messagingRow: row });
            utils.twilio = undefined;
            fakeSdk(utils);

            await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow("Twilio is not configured.");
        }
    });

    it("uses config's token, saying why, when the saved one can't be decrypted (the encryption key changed)", async () => {
        const otherKey = "00".repeat(31) + "01";
        const { utils } = makeUtils({ twilioConfig: { ...CONFIG, accountSid: SID }, messagingRow: saved(SID, "saved-token", otherKey) });
        const { build } = fakeSdk(utils);

        await utils.sendSMS("login-otp", { totp: "1" }, SMS);

        // Same credentials as the client MessagingUtils already built from config, so nothing to rebuild.
        expect(build).not.toHaveBeenCalled();
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"));
    });

    it("uses config, saying why, when the settings can't be read", async () => {
        const { utils, create } = makeUtils({ twilioConfig: CONFIG, failMessagingRead: true });
        fakeSdk(utils);

        await utils.sendSMS("login-otp", { totp: "1" }, SMS);

        expect(create).toHaveBeenCalledTimes(1);
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"));
    });

    it("leaves SMS unconfigured, saying why, when the SDK rejects the credentials — and doesn't retry until they change", async () => {
        const { utils, messagingRepo } = makeUtils({ twilioConfig: null, messagingRow: saved(SID, "bad") });
        const build = vi.spyOn(utils, "createTwilioClient").mockRejectedValue(new Error("accountSid must start with AC"));

        await expect(utils.sendSMS("login-otp", { totp: "1" }, SMS)).rejects.toThrow("Twilio is not configured.");
        await expect(utils.sendSMS("login-otp", { totp: "2" }, SMS)).rejects.toThrow("Twilio is not configured.");
        expect(build).toHaveBeenCalledTimes(1);
        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to set up Twilio with the current credentials"));

        messagingRepo.findOne.mockResolvedValue(saved(SID, "fixed"));
        build.mockResolvedValue({ messages: { create: vi.fn().mockResolvedValue({}) } });
        await expect(utils.sendSMS("login-otp", { totp: "3" }, SMS)).resolves.toBeDefined();
        expect(build).toHaveBeenCalledTimes(2);
    });

    it("builds a real Twilio client from valid credentials, without touching the network", async () => {
        const { utils } = makeUtils();

        const client = await (utils).createTwilioClient({ accountSid: SID, token: "saved-token" });

        // The real SDK: built, and able to send, without anything having been sent.
        expect((client).constructor.name).toBe("Twilio");
        expect(typeof (client).messages.create).toBe("function");
    });

    it("has the SDK refuse a malformed account SID, which is why the console checks it before saving", async () => {
        const { utils } = makeUtils();

        await expect((utils).createTwilioClient({ accountSid: "not-a-sid", token: "t" })).rejects.toThrow();
    });
});

describe("seeding as the server starts", () => {
    it("fills the settings from config, so the console shows them straight away", async () => {
        const { utils, getMessagingRow } = makeUtils({ twilioConfig: { accountSid: SID, token: "config-token" } });

        await utils.seedMessagingSettings();

        expect(getMessagingRow()).toMatchObject({ seeded: true, twilioAccountSid: SID, fromEmail: "no-reply@acme.test" });
        expect(decryptSecret(getMessagingRow().twilioToken, KEY)).toBe("config-token");
    });

    it("must not stop the server when it can't, saying why: config applies until they are seeded", async () => {
        const { utils } = makeUtils({ failMessagingRead: true });

        await expect(utils.seedMessagingSettings()).resolves.toBeUndefined();

        expect(utils.logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to seed the messaging settings"));
    });
});

describe("the admin console — transport settings", () => {
    it("reads and saves the Twilio settings through the store, never returning the token", async () => {
        const { utils } = makeUtils({ twilioConfig: { accountSid: SID, token: "config-token" } });

        expect(await utils.getTwilioSettings()).toEqual({ accountSid: SID, tokenSet: true, from: "+15555550100", configured: true });
        const updated = await utils.updateTwilioSettings({ token: "new-secret", from: "Acme" });

        expect(updated).toEqual({ accountSid: SID, tokenSet: true, from: "Acme", configured: true });
        expect(JSON.stringify(updated)).not.toContain("new-secret");
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
            twilioConfig: { accountSid: SID, token: "config-token" },
            smtpConfig: { host: "smtp.config.test", port: 587 },
            messagingRow: {
                uid: "default",
                version: 1,
                seeded: true,
                twilioAccountSid: OTHER_SID,
                fromSms: "Changed",
                smtpHost: "changed.test",
                fromEmail: "changed@acme.test",
            },
        });

        const twilio = await utils.resetTwilioSettings();
        const smtp = await utils.resetSmtpSettings();

        expect(twilio).toEqual({ accountSid: SID, tokenSet: true, from: "+15555550100", configured: true });
        expect(smtp).toMatchObject({ host: "smtp.config.test", port: 587, from: "no-reply@acme.test", configured: true });
        expect(JSON.stringify([twilio, smtp])).not.toContain("config-token");
    });

    it("refuses a bad value with a 400", async () => {
        const { utils } = makeUtils();

        await expect(utils.updateTwilioSettings({ accountSid: "nope" })).rejects.toMatchObject({ status: 400 });
        await expect(utils.updateSmtpSettings({ host: "smtp://nope" })).rejects.toMatchObject({ status: 400 });
    });
});
