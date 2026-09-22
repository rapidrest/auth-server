///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Isolated unit tests for MessagingSettingsStore — no HTTP server, no database. The repository is a fake; the
// seeding, resolving, validating and encrypting are the real code. See MessageTemplateRoute.*.test.ts for the same
// thing against a real database.
import { describe, expect, it, vi } from "vitest";
import { ConfiguredMessaging } from "../src/messaging/MessagingSettings.js";
import { MessagingSettingsStore } from "../src/messaging/MessagingSettingsStore.js";
import { decryptSecret, encryptSecret } from "../src/messaging/SecretBox.js";

const KEY = "96aa4879e304e525b74141bf1bc072c17e2b90c5b35250a2d18cbd2b8d4172ac";
const OTHER_KEY = "00".repeat(31) + "01";
const SID = "AC" + "0123456789abcdef".repeat(2);
const OTHER_SID = "AC" + "fedcba9876543210".repeat(2);
const PROFILE_ID = "40017a5c-2d1f-4d4e-9d0a-6a3f2d1b9c11";
const OTHER_PROFILE_ID = "5b3c9f2e-0000-4000-8000-000000000001";
const PHONE_NUMBER_ID = "109876543210";
const OTHER_PHONE_NUMBER_ID = "555000111222";

class FakeModel {
    constructor(other?: Record<string, unknown>) {
        Object.assign(this, other);
    }
}

const SMTP_CONFIG: ConfiguredMessaging["smtp"] = {
    host: "smtp.config.test",
    port: 587,
    secure: false,
    auth: { user: "config-user", pass: "config-pass" },
    tls: { minVersion: "TLSv1.2" },
};
const WHATSAPP_CONFIG: ConfiguredMessaging["whatsapp"] = { accessToken: "config-wa-token", phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v22.0" };

/** A deployment whose `sms_config` names Twilio. */
const CONFIG: ConfiguredMessaging = {
    smtp: SMTP_CONFIG,
    from: { email: "config@acme.test", sms: "+15555550100" },
    sms: { provider: "twilio", config: { accountSid: SID, token: "config-token", options: { region: "au1" } } },
    whatsapp: WHATSAPP_CONFIG,
};

/** The same deployment, its `sms_config` naming Telnyx instead. */
const TELNYX_CONFIG: ConfiguredMessaging = {
    ...CONFIG,
    sms: { provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } },
};

interface Options {
    row?: Record<string, any>;
    configured?: ConfiguredMessaging;
    encryptionKey?: string;
    failFind?: boolean;
    /** Makes the first create/update fail as if another instance had got there first. */
    raceOnWrite?: Record<string, any>;
    failWrite?: boolean;
}

function makeStore(options: Options = {}) {
    let row: any = options.row;
    const repo = {
        findOne: vi.fn(async () => {
            if (options.failFind) throw new Error("db down");
            return row;
        }),
        create: vi.fn(async (obj: any) => {
            if (options.failWrite) throw new Error("write failed");
            if (options.raceOnWrite) {
                row = { uid: "default", version: 1, ...options.raceOnWrite };
                throw new Error("duplicate uid");
            }
            row = { ...obj, version: 0 };
            return row;
        }),
        update: vi.fn(async (obj: any, existing: any) => {
            if (options.failWrite) throw new Error("write failed");
            if (options.raceOnWrite) {
                row = { ...existing, version: existing.version + 1, ...options.raceOnWrite };
                throw new Error("version conflict");
            }
            row = { ...obj, version: existing.version + 1 };
            return row;
        }),
    };
    const warn = vi.fn();
    const store = new MessagingSettingsStore({
        repo: async () => repo as any,
        modelClass: FakeModel as any,
        encryptionKey: () => options.encryptionKey ?? KEY,
        configured: () => options.configured ?? CONFIG,
        warn,
    });
    return { store, repo, warn, getRow: () => row };
}

/** A seeded row for `resolve()` and the updates to start from. */
const seededRow = (fields: Record<string, unknown> = {}) => ({ uid: "default", version: 1, seeded: true, ...fields });

describe("seeding", () => {
    it("fills a fresh row from the deployment's config, encrypting the secrets, and marks it seeded", async () => {
        const { store, repo, getRow } = makeStore();

        const row = await store.get();

        expect(repo.create).toHaveBeenCalledTimes(1);
        expect(row).toMatchObject({
            uid: "default",
            seeded: true,
            smtpHost: "smtp.config.test",
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: "config-user",
            fromEmail: "config@acme.test",
            fromSms: "+15555550100",
            smsProvider: "twilio",
            twilioAccountSid: SID,
            whatsappPhoneNumberId: PHONE_NUMBER_ID,
            whatsappApiVersion: "v22.0",
        });
        expect(row.smtpPassword).toMatch(/^enc:v1:/);
        expect(row.twilioToken).toMatch(/^enc:v1:/);
        expect(row.whatsappAccessToken).toMatch(/^enc:v1:/);
        expect(decryptSecret(row.smtpPassword!, KEY)).toBe("config-pass");
        expect(decryptSecret(row.twilioToken!, KEY)).toBe("config-token");
        expect(decryptSecret(row.whatsappAccessToken!, KEY)).toBe("config-wa-token");
        for (const secret of ["config-pass", "config-token", "config-wa-token"]) {
            expect(JSON.stringify(getRow())).not.toContain(secret);
        }
    });

    it("seeds Telnyx as the provider from `sms_config`, with none of Twilio's settings", async () => {
        const { store, getRow } = makeStore({ configured: TELNYX_CONFIG });

        const row = await store.get();

        expect(row).toMatchObject({ smsProvider: "telnyx", telnyxMessagingProfileId: PROFILE_ID, fromSms: "+15555550100" });
        expect(decryptSecret(row.telnyxApiKey!, KEY)).toBe("config-telnyx-key");
        expect(row.twilioAccountSid).toBeUndefined();
        expect(row.twilioToken).toBeUndefined();
        expect(JSON.stringify(getRow())).not.toContain("config-telnyx-key");
    });

    it("seeds no provider, and none of either's settings, when config has no `sms_config` or one that names an unknown provider", async () => {
        for (const sms of [undefined, null, { provider: "vonage", config: { apiKey: "KEY" } }]) {
            const { store } = makeStore({ configured: { ...CONFIG, sms } });

            const row = await store.get();

            expect(row.smsProvider, JSON.stringify(sms)).toBeUndefined();
            expect(row.twilioAccountSid).toBeUndefined();
            expect(row.twilioToken).toBeUndefined();
            expect(row.telnyxApiKey).toBeUndefined();
            expect(row).toMatchObject({ seeded: true, fromSms: "+15555550100" });
        }
    });

    it("does not read the old top-level `twilio` block", async () => {
        const { store } = makeStore({ configured: { from: { email: "a@b.c" }, twilio: { accountSid: SID, token: "old-token" } } as any });

        const row = await store.get();

        expect(row.twilioAccountSid).toBeUndefined();
        expect(row.twilioToken).toBeUndefined();
        expect(row.smsProvider).toBeUndefined();
    });

    it("does it once: a seeded row is read as it is, whatever config now says", async () => {
        const { store, repo } = makeStore({
            row: { uid: "default", version: 4, seeded: true, smtpHost: "saved.test", fromEmail: "saved@acme.test", smsProvider: "telnyx" },
        });

        const row = await store.get();

        expect(row.smtpHost).toBe("saved.test");
        expect(row.fromEmail).toBe("saved@acme.test");
        expect(row.smsProvider).toBe("telnyx");
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("leaves a field the admin cleared cleared, rather than bringing it back from config", async () => {
        const { store } = makeStore({
            row: {
                uid: "default",
                version: 4,
                seeded: true,
                smtpHost: null,
                fromEmail: null,
                fromSms: null,
                smsProvider: null,
                whatsappPhoneNumberId: null,
                whatsappAccessToken: null,
            },
        });

        const row = await store.get();

        expect(row.smtpHost).toBeNull();
        expect(row.fromEmail).toBeNull();
        expect(row.smsProvider).toBeNull();
        expect((await store.getSms()).from).toBeUndefined();
        expect(await store.getWhatsApp()).toMatchObject({ phoneNumberId: undefined, accessTokenSet: false, configured: false });
    });

    it("keeps what was already saved in a row that was never seeded, filling in only the gaps", async () => {
        const saved = encryptSecret("saved-token", KEY);
        const { store, repo } = makeStore({
            row: { uid: "default", version: 2, twilioAccountSid: OTHER_SID, twilioToken: saved, fromSms: null },
        });

        const row = await store.get();

        expect(repo.update).toHaveBeenCalledTimes(1);
        expect(row.twilioAccountSid).toBe(OTHER_SID);
        expect(row.twilioToken).toBe(saved);
        expect(row.fromSms).toBe("+15555550100");
        expect(row.smtpHost).toBe("smtp.config.test");
        expect(row.whatsappPhoneNumberId).toBe(PHONE_NUMBER_ID);
        expect(row.seeded).toBe(true);
    });

    it("keeps the provider and WhatsApp settings already saved in a row that was never seeded", async () => {
        const saved = encryptSecret("saved-wa-token", KEY);
        const { store } = makeStore({
            row: { uid: "default", version: 2, smsProvider: "telnyx", whatsappAccessToken: saved, whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID },
            configured: CONFIG,
        });

        const row = await store.get();

        expect(row.smsProvider).toBe("telnyx");
        expect(row.whatsappAccessToken).toBe(saved);
        expect(row.whatsappPhoneNumberId).toBe(OTHER_PHONE_NUMBER_ID);
        expect(row.whatsappApiVersion).toBe("v22.0");
    });

    it("seeds only what config has, and still marks the row seeded so it isn't retried", async () => {
        const { store, repo } = makeStore({ configured: { from: { email: "only@acme.test", sms: "" } } });

        const row = await store.get();

        expect(row).toMatchObject({ seeded: true, fromEmail: "only@acme.test" });
        expect(row.smtpHost).toBeUndefined();
        expect(row.fromSms).toBeUndefined();
        expect(row.twilioToken).toBeUndefined();
        expect(row.whatsappAccessToken).toBeUndefined();
        expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it("needs no encryption key when config has no secret to store", async () => {
        const { store } = makeStore({ configured: { from: { email: "a@b.c" } }, encryptionKey: "" });

        await expect(store.get()).resolves.toMatchObject({ seeded: true, fromEmail: "a@b.c" });
    });

    it("refuses to seed a secret without a valid key, rather than store it in the clear or drop it", async () => {
        for (const encryptionKey of ["", "abc"]) {
            for (const configured of [CONFIG, TELNYX_CONFIG, { whatsapp: WHATSAPP_CONFIG }]) {
                const { store, repo } = makeStore({ encryptionKey, configured });

                await expect(store.get()).rejects.toMatchObject({ status: 500, message: expect.stringContaining("encryption_key") });
                expect(repo.create).not.toHaveBeenCalled();
            }
        }
    });

    it("accepts what another instance seeded at the same moment", async () => {
        const raced = { seeded: true, smtpHost: "raced.test" };
        const fresh = makeStore({ raceOnWrite: raced });
        await expect(fresh.store.get()).resolves.toMatchObject({ smtpHost: "raced.test" });

        const existing = makeStore({ row: { uid: "default", version: 1 }, raceOnWrite: raced });
        await expect(existing.store.get()).resolves.toMatchObject({ smtpHost: "raced.test" });
    });

    it("reports a write that failed for a reason other than a race", async () => {
        const { store } = makeStore({ failWrite: true });

        await expect(store.get()).rejects.toThrow("write failed");
    });

    it("reports a row that can't be read", async () => {
        const { store } = makeStore({ failFind: true });

        await expect(store.get()).rejects.toThrow("db down");
    });
});

describe("resolving what's in effect", () => {
    it("uses the seeded values, decrypted, with the deployment's remaining options merged in", async () => {
        const { store } = makeStore();

        const resolved = await store.resolve();

        expect(resolved.smtp).toEqual({
            tls: { minVersion: "TLSv1.2" },
            host: "smtp.config.test",
            port: 587,
            secure: false,
            auth: { user: "config-user", pass: "config-pass" },
        });
        expect(resolved.from).toEqual({ email: "config@acme.test", sms: "+15555550100" });
        expect(resolved.sms).toEqual({ provider: "twilio", config: { accountSid: SID, token: "config-token", options: { region: "au1" } } });
        expect(resolved.whatsapp).toEqual({ accessToken: "config-wa-token", phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v22.0" });
    });

    it("resolves Telnyx, and only Telnyx, when config names it", async () => {
        const { store } = makeStore({ configured: TELNYX_CONFIG });

        const resolved = await store.resolve();

        expect(resolved.sms).toEqual({ provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } });
    });

    it("leaves the messaging profile out for Telnyx unless one is set", async () => {
        const { store } = makeStore({ configured: { ...TELNYX_CONFIG, sms: { provider: "telnyx", config: { apiKey: "config-telnyx-key" } } } });

        const resolved = await store.resolve();

        expect(resolved.sms).toEqual({ provider: "telnyx", config: { apiKey: "config-telnyx-key" } });
        expect(resolved.sms?.config).not.toHaveProperty("messagingProfileId");
    });

    it("uses what the admin saved over what config says", async () => {
        const { store } = makeStore({
            row: seededRow({
                smtpHost: "saved.test",
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: "saved-user",
                smtpPassword: encryptSecret("saved-pass", KEY),
                fromEmail: "saved@acme.test",
                smsProvider: "twilio",
                twilioAccountSid: OTHER_SID,
                twilioToken: encryptSecret("saved-token", KEY),
                fromSms: "Acme",
                whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID,
                whatsappAccessToken: encryptSecret("saved-wa-token", KEY),
                whatsappApiVersion: "v21.0",
            }),
        });

        const resolved = await store.resolve();

        expect(resolved.smtp).toMatchObject({ host: "saved.test", port: 465, secure: true, auth: { user: "saved-user", pass: "saved-pass" } });
        expect(resolved.from).toEqual({ email: "saved@acme.test", sms: "Acme" });
        expect(resolved.sms).toMatchObject({ provider: "twilio", config: { accountSid: OTHER_SID, token: "saved-token" } });
        expect(resolved.whatsapp).toEqual({ accessToken: "saved-wa-token", phoneNumberId: OTHER_PHONE_NUMBER_ID, apiVersion: "v21.0" });
    });

    it("uses the provider the admin saved even when config names the other one, and takes nothing from the other's config", async () => {
        const { store } = makeStore({
            configured: TELNYX_CONFIG,
            row: seededRow({
                smsProvider: "twilio",
                twilioAccountSid: OTHER_SID,
                twilioToken: encryptSecret("saved-token", KEY),
                telnyxApiKey: encryptSecret("saved-telnyx-key", KEY),
            }),
        });

        const resolved = await store.resolve();

        // Twilio's `options` live in config under `sms_config.config` only when Twilio is the configured provider.
        expect(resolved.sms).toEqual({ provider: "twilio", config: { accountSid: OTHER_SID, token: "saved-token", options: undefined } });
    });

    it("only has the chosen provider in effect after a switch, keeping the other's saved values for switching back", async () => {
        const twilioToken = encryptSecret("saved-token", KEY);
        const telnyxApiKey = encryptSecret("saved-telnyx-key", KEY);
        const both = { twilioAccountSid: SID, twilioToken, telnyxApiKey, telnyxMessagingProfileId: PROFILE_ID, fromSms: "+15555550100" };
        const { store, getRow } = makeStore({ row: seededRow({ ...both, smsProvider: "twilio" }), configured: {} });

        expect((await store.resolve()).sms).toEqual({ provider: "twilio", config: { accountSid: SID, token: "saved-token", options: undefined } });

        await store.updateSms({ provider: "telnyx" });
        expect((await store.resolve()).sms).toEqual({ provider: "telnyx", config: { apiKey: "saved-telnyx-key", messagingProfileId: PROFILE_ID } });
        // Twilio's saved values are kept, just unused.
        expect(getRow()).toMatchObject({ twilioAccountSid: SID, twilioToken });

        await store.updateSms({ provider: "twilio" });
        expect((await store.resolve()).sms).toMatchObject({ provider: "twilio", config: { accountSid: SID, token: "saved-token" } });
        expect(getRow()).toMatchObject({ telnyxApiKey, telnyxMessagingProfileId: PROFILE_ID });
    });

    it("has nothing for a chosen provider that has no credentials, even if the other has a complete set", async () => {
        const twilioOnly = seededRow({ smsProvider: "telnyx", twilioAccountSid: SID, twilioToken: encryptSecret("t", KEY) });
        const telnyxOnly = seededRow({ smsProvider: "twilio", telnyxApiKey: encryptSecret("k", KEY) });

        expect((await makeStore({ row: twilioOnly, configured: {} }).store.resolve()).sms).toBeUndefined();
        expect((await makeStore({ row: telnyxOnly, configured: {} }).store.resolve()).sms).toBeUndefined();
    });

    it("infers the provider for a row with none saved: Twilio if it has credentials, else Telnyx", async () => {
        const twilio = makeStore({ configured: {}, row: seededRow({ twilioAccountSid: SID, twilioToken: encryptSecret("t", KEY) }) });
        const telnyx = makeStore({ configured: {}, row: seededRow({ telnyxApiKey: encryptSecret("k", KEY) }) });
        const both = makeStore({
            configured: {},
            row: seededRow({ twilioAccountSid: SID, twilioToken: encryptSecret("t", KEY), telnyxApiKey: encryptSecret("k", KEY) }),
        });

        expect((await twilio.store.resolve()).sms?.provider).toBe("twilio");
        expect((await telnyx.store.resolve()).sms).toEqual({ provider: "telnyx", config: { apiKey: "k" } });
        expect((await both.store.resolve()).sms?.provider).toBe("twilio");
    });

    it("has nothing for what the admin cleared, without falling back to config", async () => {
        const { store } = makeStore({
            row: seededRow({
                smtpHost: null,
                smsProvider: null,
                twilioAccountSid: null,
                twilioToken: null,
                telnyxApiKey: null,
                fromEmail: null,
                fromSms: null,
                whatsappPhoneNumberId: null,
                whatsappAccessToken: null,
            }),
        });

        const resolved = await store.resolve();

        expect(resolved).toEqual({ smtp: undefined, from: { email: undefined, sms: undefined }, sms: undefined, whatsapp: undefined });
    });

    it("has no Twilio credentials unless both a SID and a token are saved", async () => {
        const noToken = makeStore({ row: seededRow({ twilioAccountSid: SID, twilioToken: null }) });
        const noSid = makeStore({ row: seededRow({ twilioAccountSid: null, twilioToken: encryptSecret("t", KEY) }) });

        expect((await noToken.store.resolve()).sms).toBeUndefined();
        expect((await noSid.store.resolve()).sms).toBeUndefined();
    });

    it("has no WhatsApp credentials unless both a token and a phone number ID are saved", async () => {
        const noToken = makeStore({ row: seededRow({ whatsappPhoneNumberId: PHONE_NUMBER_ID, whatsappAccessToken: null }) });
        const noId = makeStore({ row: seededRow({ whatsappPhoneNumberId: null, whatsappAccessToken: encryptSecret("t", KEY) }) });
        const noVersion = makeStore({ row: seededRow({ whatsappPhoneNumberId: PHONE_NUMBER_ID, whatsappAccessToken: encryptSecret("t", KEY) }) });

        expect((await noToken.store.resolve()).whatsapp).toBeUndefined();
        expect((await noId.store.resolve()).whatsapp).toBeUndefined();
        expect((await noVersion.store.resolve()).whatsapp).toEqual({ accessToken: "t", phoneNumberId: PHONE_NUMBER_ID });
    });

    it("has no SMTP authentication when there's no saved password, and none when there's no host", async () => {
        const noPassword = makeStore({ row: seededRow({ smtpHost: "h", smtpUser: "u", smtpPassword: null }) });
        const noHost = makeStore({ row: seededRow({ smtpHost: null, smtpUser: "u" }) });

        // No `auth`, but the deployment's other nodemailer options are still merged in.
        expect((await noPassword.store.resolve()).smtp).toEqual({ tls: { minVersion: "TLSv1.2" }, host: "h" });
        expect((await noHost.store.resolve()).smtp).toBeUndefined();
    });

    it("falls back to config's value for a saved secret that can't be decrypted, and says why", async () => {
        const { store, warn } = makeStore({
            row: seededRow({
                smtpHost: "smtp.config.test",
                smtpUser: "config-user",
                smtpPassword: encryptSecret("old-pass", OTHER_KEY),
                smsProvider: "twilio",
                twilioAccountSid: SID,
                twilioToken: encryptSecret("old-token", OTHER_KEY),
                whatsappPhoneNumberId: PHONE_NUMBER_ID,
                whatsappAccessToken: encryptSecret("old-wa-token", OTHER_KEY),
            }),
        });

        const resolved = await store.resolve();

        expect(resolved.smtp?.auth).toEqual({ user: "config-user", pass: "config-pass" });
        expect(resolved.sms?.config).toMatchObject({ token: "config-token" });
        expect(resolved.whatsapp?.accessToken).toBe("config-wa-token");
        expect(warn).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"), expect.anything());
    });

    it("falls back to config's Telnyx API key for a saved one that can't be decrypted", async () => {
        const { store, warn } = makeStore({
            configured: TELNYX_CONFIG,
            row: seededRow({ smsProvider: "telnyx", telnyxApiKey: encryptSecret("old-key", OTHER_KEY), telnyxMessagingProfileId: OTHER_PROFILE_ID }),
        });

        const resolved = await store.resolve();

        expect(resolved.sms).toEqual({ provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: OTHER_PROFILE_ID } });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"), expect.anything());
    });

    it("does not fall back to the other provider's config value for a secret that can't be decrypted", async () => {
        // Telnyx is configured and Twilio saved, so there's no Twilio token in config to fall back to.
        const twilio = makeStore({
            configured: TELNYX_CONFIG,
            row: seededRow({ smsProvider: "twilio", twilioAccountSid: SID, twilioToken: encryptSecret("old", OTHER_KEY) }),
        });
        // And the other way round.
        const telnyx = makeStore({
            configured: CONFIG,
            row: seededRow({ smsProvider: "telnyx", telnyxApiKey: encryptSecret("old", OTHER_KEY) }),
        });

        expect((await twilio.store.resolve()).sms).toBeUndefined();
        expect((await telnyx.store.resolve()).sms).toBeUndefined();
    });

    it("has no such secret when it can't be decrypted and config has no value for it either", async () => {
        const { store } = makeStore({
            configured: {},
            row: seededRow({
                twilioAccountSid: SID,
                twilioToken: encryptSecret("old-token", OTHER_KEY),
                whatsappPhoneNumberId: PHONE_NUMBER_ID,
                whatsappAccessToken: encryptSecret("old-wa-token", OTHER_KEY),
            }),
        });

        const resolved = await store.resolve();

        expect(resolved.sms).toBeUndefined();
        expect(resolved.whatsapp).toBeUndefined();
    });

    it("never throws: it uses config alone when the row can't be read, and says why", async () => {
        const { store, warn } = makeStore({ failFind: true });

        const resolved = await store.resolve();

        expect(resolved.from).toEqual({ email: "config@acme.test", sms: "+15555550100" });
        expect(resolved.smtp).toMatchObject({ host: "smtp.config.test" });
        expect(resolved.sms).toMatchObject({ provider: "twilio", config: { accountSid: SID, token: "config-token" } });
        expect(resolved.whatsapp).toMatchObject({ accessToken: "config-wa-token", phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v22.0" });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"), expect.any(Error));
    });

    it("uses config's Telnyx settings alone when the row can't be read", async () => {
        const { store } = makeStore({ failFind: true, configured: TELNYX_CONFIG });

        expect((await store.resolve()).sms).toEqual({ provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } });
    });

    it("uses config alone when it can't be seeded either (a secret in config with no encryption key)", async () => {
        const { store, warn } = makeStore({ encryptionKey: "" });

        const resolved = await store.resolve();

        expect(resolved.sms).toMatchObject({ provider: "twilio", config: { token: "config-token" } });
        expect(resolved.whatsapp).toMatchObject({ accessToken: "config-wa-token" });
        expect(warn).toHaveBeenCalled();
    });
});

describe("saving", () => {
    it("saves the Twilio settings over the seeded row, encrypting the token, and reports them without it", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateSms({ twilio: { accountSid: OTHER_SID, token: "  new-token  " }, from: "+15555550199" });

        expect(dto).toEqual({
            provider: "twilio",
            twilio: { accountSid: OTHER_SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550199",
            configured: true,
        });
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("new-token");
        expect(JSON.stringify(dto)).not.toContain("new-token");
    });

    it("saves the Telnyx settings and the choice of provider, encrypting the API key, and reports them without it", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateSms({ provider: "telnyx", telnyx: { apiKey: "  new-telnyx-key ", messagingProfileId: PROFILE_ID } });

        expect(dto).toEqual({
            provider: "telnyx",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: true, messagingProfileId: PROFILE_ID },
            from: "+15555550100",
            configured: true,
        });
        expect(getRow().telnyxApiKey).toMatch(/^enc:v1:/);
        expect(decryptSecret(getRow().telnyxApiKey, KEY)).toBe("new-telnyx-key");
        expect(JSON.stringify(dto)).not.toContain("new-telnyx-key");
        expect(JSON.stringify(getRow())).not.toContain("new-telnyx-key");
    });

    it("reports Telnyx as chosen but not configured until it has an API key", async () => {
        const { store } = makeStore();

        expect(await store.updateSms({ provider: "telnyx" })).toMatchObject({ provider: "telnyx", configured: false });
        expect(await store.updateSms({ telnyx: { apiKey: "KEY" } })).toMatchObject({ provider: "telnyx", configured: true });
    });

    it("saves the WhatsApp settings over the seeded row, encrypting the token, and reports them without it", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateWhatsApp({ phoneNumberId: ` ${OTHER_PHONE_NUMBER_ID} `, accessToken: "  new-wa-token  ", apiVersion: "v23.0" });

        expect(dto).toEqual({ phoneNumberId: OTHER_PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v23.0", configured: true });
        expect(decryptSecret(getRow().whatsappAccessToken, KEY)).toBe("new-wa-token");
        expect(JSON.stringify(dto)).not.toContain("new-wa-token");
        expect(JSON.stringify(getRow())).not.toContain("new-wa-token");
    });

    it("saves the SMTP settings, keeping the password exactly as given", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateSmtp({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", password: " new pass ", from: "New <new@acme.test>" });

        expect(dto).toEqual({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", passwordSet: true, from: "New <new@acme.test>", configured: true });
        expect(decryptSecret(getRow().smtpPassword, KEY)).toBe(" new pass ");
    });

    it("leaves what wasn't sent as it was, and clears with null", async () => {
        const { store, getRow } = makeStore();

        await store.updateSms({ from: "Acme" });
        expect(getRow().twilioAccountSid).toBe(SID);
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("config-token");
        expect(getRow().smsProvider).toBe("twilio");

        await store.updateSms({ twilio: { token: null, accountSid: null }, from: null });
        expect(getRow()).toMatchObject({ twilioToken: null, twilioAccountSid: null, fromSms: null });
        expect((await store.getSms()).configured).toBe(false);

        await store.updateSmtp({ password: null, host: null });
        expect(getRow()).toMatchObject({ smtpPassword: null, smtpHost: null });
        expect((await store.getSmtp()).configured).toBe(false);
    });

    it("clears Telnyx's settings and the choice of provider with null, and WhatsApp's the same way", async () => {
        const { store, getRow } = makeStore({ configured: TELNYX_CONFIG });

        await store.updateSms({ provider: null, telnyx: { apiKey: null, messagingProfileId: null } });
        expect(getRow()).toMatchObject({ smsProvider: null, telnyxApiKey: null, telnyxMessagingProfileId: null });
        expect(await store.getSms()).toMatchObject({ provider: undefined, telnyx: { apiKeySet: false, messagingProfileId: undefined }, configured: false });

        await store.updateWhatsApp({ phoneNumberId: null, accessToken: null, apiVersion: null });
        expect(getRow()).toMatchObject({ whatsappPhoneNumberId: null, whatsappAccessToken: null, whatsappApiVersion: null });
        expect(await store.getWhatsApp()).toEqual({ phoneNumberId: undefined, accessTokenSet: false, apiVersion: undefined, configured: false });
    });

    it("changes one provider's settings without touching the other's, whichever is in use", async () => {
        const { store, getRow } = makeStore();
        await store.updateSms({ telnyx: { apiKey: "KEY", messagingProfileId: PROFILE_ID } });
        const twilioBefore = { twilioAccountSid: getRow().twilioAccountSid, twilioToken: getRow().twilioToken };

        await store.updateSms({ telnyx: { messagingProfileId: OTHER_PROFILE_ID } });
        expect(getRow()).toMatchObject({ ...twilioBefore, smsProvider: "twilio", telnyxMessagingProfileId: OTHER_PROFILE_ID });
        expect(decryptSecret(getRow().telnyxApiKey, KEY)).toBe("KEY");

        await store.updateSms({ twilio: { accountSid: OTHER_SID } });
        expect(getRow()).toMatchObject({ twilioAccountSid: OTHER_SID, telnyxMessagingProfileId: OTHER_PROFILE_ID });
    });

    it("saves nothing when there's nothing to change, treating a missing body as that", async () => {
        const { store, repo } = makeStore({ row: { uid: "default", version: 1, seeded: true, smtpHost: "h" } });

        await store.updateSmtp({});
        await store.updateSms({});
        await store.updateSms({ twilio: {}, telnyx: {} });
        await store.updateWhatsApp({});
        await store.updateSms(undefined as any);
        await store.updateWhatsApp(undefined as any);
        await store.updateSmtp(undefined as any);

        expect(repo.update).not.toHaveBeenCalled();
    });

    it("refuses a bad value before reading or writing anything", async () => {
        const { store, repo } = makeStore();

        await expect(store.updateSms({ twilio: { accountSid: "nope" } })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateSms({ provider: "vonage" as any })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateSms({ telnyx: { messagingProfileId: "not valid!" } })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateSms({ telnyx: "KEY" as any })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateWhatsApp({ phoneNumberId: "+15555550100" })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateWhatsApp({ apiVersion: "23" })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateSmtp({ port: 0 })).rejects.toMatchObject({ status: 400 });
        expect(repo.findOne).not.toHaveBeenCalled();
        expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuses to store a secret without a valid encryption key, rather than store it in the clear", async () => {
        for (const encryptionKey of ["", "abc"]) {
            const twilio = makeStore({ encryptionKey, configured: {} });
            await expect(twilio.store.updateSms({ twilio: { token: "secret" } })).rejects.toMatchObject({ status: 500, message: expect.stringContaining("encryption_key") });
            expect(twilio.repo.create).not.toHaveBeenCalled();
            expect(twilio.repo.update).not.toHaveBeenCalled();

            const telnyx = makeStore({ encryptionKey, configured: {} });
            await expect(telnyx.store.updateSms({ telnyx: { apiKey: "secret" } })).rejects.toMatchObject({ status: 500 });
            expect(telnyx.repo.update).not.toHaveBeenCalled();

            const whatsapp = makeStore({ encryptionKey, configured: {} });
            await expect(whatsapp.store.updateWhatsApp({ accessToken: "secret" })).rejects.toMatchObject({ status: 500 });
            expect(whatsapp.repo.update).not.toHaveBeenCalled();

            const smtp = makeStore({ encryptionKey, configured: {} });
            await expect(smtp.store.updateSmtp({ password: "secret" })).rejects.toMatchObject({ status: 500 });
        }
    });

    it("still saves the parts that aren't secrets without a key", async () => {
        const { store } = makeStore({ encryptionKey: "", configured: {} });

        await expect(store.updateSms({ twilio: { accountSid: SID }, from: "+15555550100" })).resolves.toMatchObject({
            twilio: { accountSid: SID, tokenSet: false },
        });
        await expect(store.updateSms({ provider: "telnyx", telnyx: { messagingProfileId: PROFILE_ID } })).resolves.toMatchObject({
            provider: "telnyx",
            telnyx: { apiKeySet: false, messagingProfileId: PROFILE_ID },
        });
        await expect(store.updateWhatsApp({ phoneNumberId: PHONE_NUMBER_ID, apiVersion: "v23.0" })).resolves.toMatchObject({
            phoneNumberId: PHONE_NUMBER_ID,
            accessTokenSet: false,
        });
    });

    it("reads back what the admin console shows without changing anything", async () => {
        const { store, repo } = makeStore();

        expect(await store.getSms()).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: true,
        });
        expect(await store.getWhatsApp()).toEqual({ phoneNumberId: PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v22.0", configured: true });
        expect(await store.getSmtp()).toMatchObject({ host: "smtp.config.test", port: 587, secure: false, user: "config-user", passwordSet: true, from: "config@acme.test", configured: true });
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("never gives a secret to the admin console, whatever is saved", async () => {
        const { store } = makeStore({ configured: TELNYX_CONFIG });
        await store.updateWhatsApp({ accessToken: "wa-secret-value" });

        const shown = JSON.stringify([await store.getSms(), await store.getWhatsApp(), await store.getSmtp()]);

        for (const secret of ["config-telnyx-key", "wa-secret-value", "config-pass", "enc:v1"]) {
            expect(shown).not.toContain(secret);
        }
    });
});

describe("resetting to config", () => {
    /** A seeded row whose every field an admin has since changed, so a reset has something to undo. */
    const CHANGED = {
        uid: "default",
        version: 5,
        seeded: true,
        smtpHost: "changed.test",
        smtpPort: 25,
        smtpSecure: true,
        smtpUser: "changed-user",
        smtpPassword: encryptSecret("changed-pass", KEY),
        fromEmail: "changed@acme.test",
        smsProvider: "telnyx",
        twilioAccountSid: OTHER_SID,
        twilioToken: encryptSecret("changed-token", KEY),
        telnyxApiKey: encryptSecret("changed-telnyx-key", KEY),
        telnyxMessagingProfileId: OTHER_PROFILE_ID,
        fromSms: "Changed",
        whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID,
        whatsappAccessToken: encryptSecret("changed-wa-token", KEY),
        whatsappApiVersion: "v21.0",
    };

    it("puts the SMTP settings back to what config says, encrypting the password, and leaves SMS and WhatsApp alone", async () => {
        const { store, getRow } = makeStore({ row: CHANGED });

        const dto = await store.resetSmtp();

        expect(dto).toEqual({
            host: "smtp.config.test",
            port: 587,
            secure: false,
            user: "config-user",
            passwordSet: true,
            from: "config@acme.test",
            configured: true,
        });
        expect(decryptSecret(getRow().smtpPassword, KEY)).toBe("config-pass");
        expect(getRow().smtpPassword).not.toBe(CHANGED.smtpPassword);
        // The other cards' settings are exactly as they were.
        expect(getRow()).toMatchObject({
            smsProvider: "telnyx",
            twilioAccountSid: OTHER_SID,
            twilioToken: CHANGED.twilioToken,
            telnyxApiKey: CHANGED.telnyxApiKey,
            fromSms: "Changed",
            whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID,
            whatsappAccessToken: CHANGED.whatsappAccessToken,
            whatsappApiVersion: "v21.0",
        });
    });

    it("puts the SMS settings back to what config says (Twilio), encrypting the token, and leaves SMTP and WhatsApp alone", async () => {
        const { store, getRow } = makeStore({ row: CHANGED });

        const dto = await store.resetSms();

        expect(dto).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            // Config doesn't have Telnyx settings, so what was saved for it is cleared too: the card matches config exactly.
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: true,
        });
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("config-token");
        expect(getRow()).toMatchObject({ telnyxApiKey: null, telnyxMessagingProfileId: null });
        expect(getRow()).toMatchObject({
            smtpHost: "changed.test",
            smtpPort: 25,
            smtpSecure: true,
            smtpUser: "changed-user",
            smtpPassword: CHANGED.smtpPassword,
            fromEmail: "changed@acme.test",
            whatsappPhoneNumberId: OTHER_PHONE_NUMBER_ID,
            whatsappAccessToken: CHANGED.whatsappAccessToken,
            whatsappApiVersion: "v21.0",
        });
    });

    it("puts the SMS settings back to what config says (Telnyx), switching the provider back and clearing Twilio's", async () => {
        const { store, getRow } = makeStore({
            row: { ...CHANGED, smsProvider: "twilio" },
            configured: TELNYX_CONFIG,
        });

        const dto = await store.resetSms();

        expect(dto).toEqual({
            provider: "telnyx",
            twilio: { accountSid: undefined, tokenSet: false },
            telnyx: { apiKeySet: true, messagingProfileId: PROFILE_ID },
            from: "+15555550100",
            configured: true,
        });
        expect(decryptSecret(getRow().telnyxApiKey, KEY)).toBe("config-telnyx-key");
        expect(getRow()).toMatchObject({ smsProvider: "telnyx", twilioAccountSid: null, twilioToken: null });
        expect((await store.resolve()).sms).toEqual({ provider: "telnyx", config: { apiKey: "config-telnyx-key", messagingProfileId: PROFILE_ID } });
    });

    it("puts the WhatsApp settings back to what config says, encrypting the token, and leaves SMTP and SMS alone", async () => {
        const { store, getRow } = makeStore({ row: CHANGED });

        const dto = await store.resetWhatsApp();

        expect(dto).toEqual({ phoneNumberId: PHONE_NUMBER_ID, accessTokenSet: true, apiVersion: "v22.0", configured: true });
        expect(decryptSecret(getRow().whatsappAccessToken, KEY)).toBe("config-wa-token");
        expect(getRow().whatsappAccessToken).not.toBe(CHANGED.whatsappAccessToken);
        expect(getRow()).toMatchObject({
            smtpHost: "changed.test",
            smtpPassword: CHANGED.smtpPassword,
            smsProvider: "telnyx",
            twilioToken: CHANGED.twilioToken,
            telnyxApiKey: CHANGED.telnyxApiKey,
            fromSms: "Changed",
        });
    });

    it("clears what config doesn't have, so the card matches config exactly", async () => {
        const { store, getRow } = makeStore({
            row: CHANGED,
            configured: { smtp: { host: "only.test" }, from: { sms: "+15555550100" }, whatsapp: { accessToken: "only-token" } },
        });

        const smtp = await store.resetSmtp();
        expect(smtp).toEqual({ host: "only.test", port: undefined, secure: false, user: undefined, passwordSet: false, from: undefined, configured: false });
        expect(getRow()).toMatchObject({ smtpPort: null, smtpSecure: null, smtpUser: null, smtpPassword: null, fromEmail: null });

        const sms = await store.resetSms();
        expect(sms).toEqual({
            provider: undefined,
            twilio: { accountSid: undefined, tokenSet: false },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: false,
        });
        expect(getRow()).toMatchObject({ smsProvider: null, twilioAccountSid: null, twilioToken: null, telnyxApiKey: null, telnyxMessagingProfileId: null });

        // A token without a phone number ID is stored, but isn't enough to send with.
        const whatsapp = await store.resetWhatsApp();
        expect(whatsapp).toEqual({ phoneNumberId: undefined, accessTokenSet: true, apiVersion: undefined, configured: false });
        expect(getRow()).toMatchObject({ whatsappPhoneNumberId: null, whatsappApiVersion: null });
    });

    it("clears everything in its group when config has nothing at all", async () => {
        const { store } = makeStore({ row: CHANGED, configured: {} });

        expect(await store.resetSmtp()).toMatchObject({ host: undefined, passwordSet: false, configured: false });
        expect(await store.resetSms()).toMatchObject({
            provider: undefined,
            twilio: { accountSid: undefined, tokenSet: false },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: undefined,
            configured: false,
        });
        expect(await store.resetWhatsApp()).toEqual({ phoneNumberId: undefined, accessTokenSet: false, apiVersion: undefined, configured: false });
    });

    it("works on a row that was never seeded, ending up matching config all the same", async () => {
        const { store, getRow } = makeStore({ row: { uid: "default", version: 1, smtpHost: "unseeded.test" } });

        const dto = await store.resetSmtp();

        expect(dto.host).toBe("smtp.config.test");
        expect(getRow().seeded).toBe(true);
    });

    it("refuses without a valid encryption key, changing nothing rather than half-resetting", async () => {
        for (const encryptionKey of ["", "abc"]) {
            const { store, repo } = makeStore({ row: CHANGED, encryptionKey });

            await expect(store.resetSmtp()).rejects.toMatchObject({ status: 500, message: expect.stringContaining("encryption_key") });
            await expect(store.resetSms()).rejects.toMatchObject({ status: 500 });
            await expect(store.resetWhatsApp()).rejects.toMatchObject({ status: 500 });
            expect(repo.update).not.toHaveBeenCalled();
        }
    });

    it("needs no key when config has no secret for that card", async () => {
        const { store } = makeStore({
            row: CHANGED,
            encryptionKey: "",
            configured: { smtp: { host: "h" }, from: { email: "a@b.c" }, sms: { provider: "telnyx", config: { messagingProfileId: PROFILE_ID } } },
        });

        await expect(store.resetSmtp()).resolves.toMatchObject({ host: "h", from: "a@b.c" });
        await expect(store.resetSms()).resolves.toMatchObject({ provider: "telnyx", telnyx: { apiKeySet: false, messagingProfileId: PROFILE_ID } });
        await expect(store.resetWhatsApp()).resolves.toMatchObject({ accessTokenSet: false });
    });

    it("reports a row that can't be read", async () => {
        const { store } = makeStore({ failFind: true });

        await expect(store.resetSmtp()).rejects.toThrow("db down");
        await expect(store.resetSms()).rejects.toThrow("db down");
        await expect(store.resetWhatsApp()).rejects.toThrow("db down");
    });
});
