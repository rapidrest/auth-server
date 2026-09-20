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

class FakeModel {
    constructor(other?: Record<string, unknown>) {
        Object.assign(this, other);
    }
}

const CONFIG: ConfiguredMessaging = {
    smtp: { host: "smtp.config.test", port: 587, secure: false, auth: { user: "config-user", pass: "config-pass" }, tls: { minVersion: "TLSv1.2" } },
    from: { email: "config@acme.test", sms: "+15555550100" },
    twilio: { accountSid: SID, token: "config-token", options: { region: "au1" } },
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
            twilioAccountSid: SID,
        });
        expect(row.smtpPassword).toMatch(/^enc:v1:/);
        expect(row.twilioToken).toMatch(/^enc:v1:/);
        expect(decryptSecret(row.smtpPassword!, KEY)).toBe("config-pass");
        expect(decryptSecret(row.twilioToken!, KEY)).toBe("config-token");
        expect(JSON.stringify(getRow())).not.toContain("config-pass");
        expect(JSON.stringify(getRow())).not.toContain("config-token");
    });

    it("does it once: a seeded row is read as it is, whatever config now says", async () => {
        const { store, repo } = makeStore({
            row: { uid: "default", version: 4, seeded: true, smtpHost: "saved.test", fromEmail: "saved@acme.test" },
        });

        const row = await store.get();

        expect(row.smtpHost).toBe("saved.test");
        expect(row.fromEmail).toBe("saved@acme.test");
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("leaves a field the admin cleared cleared, rather than bringing it back from config", async () => {
        const { store } = makeStore({ row: { uid: "default", version: 4, seeded: true, smtpHost: null, fromEmail: null, fromSms: null } });

        const row = await store.get();

        expect(row.smtpHost).toBeNull();
        expect(row.fromEmail).toBeNull();
        expect((await store.getTwilio()).from).toBeUndefined();
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
        expect(row.seeded).toBe(true);
    });

    it("seeds only what config has, and still marks the row seeded so it isn't retried", async () => {
        const { store, repo } = makeStore({ configured: { from: { email: "only@acme.test", sms: "" } } });

        const row = await store.get();

        expect(row).toMatchObject({ seeded: true, fromEmail: "only@acme.test" });
        expect(row.smtpHost).toBeUndefined();
        expect(row.fromSms).toBeUndefined();
        expect(row.twilioToken).toBeUndefined();
        expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it("needs no encryption key when config has no secret to store", async () => {
        const { store } = makeStore({ configured: { from: { email: "a@b.c" } }, encryptionKey: "" });

        await expect(store.get()).resolves.toMatchObject({ seeded: true, fromEmail: "a@b.c" });
    });

    it("refuses to seed a secret without a valid key, rather than store it in the clear or drop it", async () => {
        for (const encryptionKey of ["", "abc"]) {
            const { store, repo } = makeStore({ encryptionKey });

            await expect(store.get()).rejects.toMatchObject({ status: 500, message: expect.stringContaining("encryption_key") });
            expect(repo.create).not.toHaveBeenCalled();
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
        expect(resolved.twilio).toEqual({ accountSid: SID, token: "config-token", options: { region: "au1" } });
    });

    it("uses what the admin saved over what config says", async () => {
        const { store } = makeStore({
            row: {
                uid: "default",
                version: 1,
                seeded: true,
                smtpHost: "saved.test",
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: "saved-user",
                smtpPassword: encryptSecret("saved-pass", KEY),
                fromEmail: "saved@acme.test",
                twilioAccountSid: OTHER_SID,
                twilioToken: encryptSecret("saved-token", KEY),
                fromSms: "Acme",
            },
        });

        const resolved = await store.resolve();

        expect(resolved.smtp).toMatchObject({ host: "saved.test", port: 465, secure: true, auth: { user: "saved-user", pass: "saved-pass" } });
        expect(resolved.from).toEqual({ email: "saved@acme.test", sms: "Acme" });
        expect(resolved.twilio).toMatchObject({ accountSid: OTHER_SID, token: "saved-token" });
    });

    it("has nothing for what the admin cleared, without falling back to config", async () => {
        const { store } = makeStore({
            row: { uid: "default", version: 1, seeded: true, smtpHost: null, twilioAccountSid: null, twilioToken: null, fromEmail: null, fromSms: null },
        });

        const resolved = await store.resolve();

        expect(resolved).toEqual({ smtp: undefined, from: { email: undefined, sms: undefined }, twilio: undefined });
    });

    it("has no Twilio credentials unless both a SID and a token are saved", async () => {
        const noToken = makeStore({ row: { uid: "default", version: 1, seeded: true, twilioAccountSid: SID, twilioToken: null } });
        const noSid = makeStore({ row: { uid: "default", version: 1, seeded: true, twilioAccountSid: null, twilioToken: encryptSecret("t", KEY) } });

        expect((await noToken.store.resolve()).twilio).toBeUndefined();
        expect((await noSid.store.resolve()).twilio).toBeUndefined();
    });

    it("has no SMTP authentication when there's no saved password, and none when there's no host", async () => {
        const noPassword = makeStore({ row: { uid: "default", version: 1, seeded: true, smtpHost: "h", smtpUser: "u", smtpPassword: null } });
        const noHost = makeStore({ row: { uid: "default", version: 1, seeded: true, smtpHost: null, smtpUser: "u" } });

        // No `auth`, but the deployment's other nodemailer options are still merged in.
        expect((await noPassword.store.resolve()).smtp).toEqual({ tls: { minVersion: "TLSv1.2" }, host: "h" });
        expect((await noHost.store.resolve()).smtp).toBeUndefined();
    });

    it("falls back to config's value for a saved secret that can't be decrypted, and says why", async () => {
        const { store, warn } = makeStore({
            row: {
                uid: "default",
                version: 1,
                seeded: true,
                smtpHost: "smtp.config.test",
                smtpUser: "config-user",
                smtpPassword: encryptSecret("old-pass", OTHER_KEY),
                twilioAccountSid: SID,
                twilioToken: encryptSecret("old-token", OTHER_KEY),
            },
        });

        const resolved = await store.resolve();

        expect(resolved.smtp?.auth).toEqual({ user: "config-user", pass: "config-pass" });
        expect(resolved.twilio?.token).toBe("config-token");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unable to decrypt a saved secret"), expect.anything());
    });

    it("has no such secret when it can't be decrypted and config has no value for it either", async () => {
        const { store } = makeStore({
            configured: {},
            row: { uid: "default", version: 1, seeded: true, twilioAccountSid: SID, twilioToken: encryptSecret("old-token", OTHER_KEY) },
        });

        expect((await store.resolve()).twilio).toBeUndefined();
    });

    it("never throws: it uses config alone when the row can't be read, and says why", async () => {
        const { store, warn } = makeStore({ failFind: true });

        const resolved = await store.resolve();

        expect(resolved.from).toEqual({ email: "config@acme.test", sms: "+15555550100" });
        expect(resolved.smtp).toMatchObject({ host: "smtp.config.test" });
        expect(resolved.twilio).toMatchObject({ accountSid: SID, token: "config-token" });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unable to read the messaging settings"), expect.any(Error));
    });

    it("uses config alone when it can't be seeded either (a secret in config with no encryption key)", async () => {
        const { store, warn } = makeStore({ encryptionKey: "" });

        const resolved = await store.resolve();

        expect(resolved.twilio).toMatchObject({ token: "config-token" });
        expect(warn).toHaveBeenCalled();
    });
});

describe("saving", () => {
    it("saves the Twilio settings over the seeded row, encrypting the token, and reports them without it", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateTwilio({ accountSid: OTHER_SID, token: "  new-token  ", from: "+15555550199" });

        expect(dto).toEqual({ accountSid: OTHER_SID, tokenSet: true, from: "+15555550199", configured: true });
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("new-token");
        expect(JSON.stringify(dto)).not.toContain("new-token");
    });

    it("saves the SMTP settings, keeping the password exactly as given", async () => {
        const { store, getRow } = makeStore();

        const dto = await store.updateSmtp({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", password: " new pass ", from: "New <new@acme.test>" });

        expect(dto).toEqual({ host: "smtp.new.test", port: 465, secure: true, user: "new-user", passwordSet: true, from: "New <new@acme.test>", configured: true });
        expect(decryptSecret(getRow().smtpPassword, KEY)).toBe(" new pass ");
    });

    it("leaves what wasn't sent as it was, and clears with null", async () => {
        const { store, getRow } = makeStore();

        await store.updateTwilio({ from: "Acme" });
        expect(getRow().twilioAccountSid).toBe(SID);
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("config-token");

        await store.updateTwilio({ token: null, accountSid: null, from: null });
        expect(getRow()).toMatchObject({ twilioToken: null, twilioAccountSid: null, fromSms: null });
        expect((await store.getTwilio()).configured).toBe(false);

        await store.updateSmtp({ password: null, host: null });
        expect(getRow()).toMatchObject({ smtpPassword: null, smtpHost: null });
        expect((await store.getSmtp()).configured).toBe(false);
    });

    it("saves nothing when there's nothing to change, treating a missing body as that", async () => {
        const { store, repo } = makeStore({ row: { uid: "default", version: 1, seeded: true, smtpHost: "h" } });

        await store.updateSmtp({});
        await store.updateTwilio(undefined as any);
        await store.updateSmtp(undefined as any);

        expect(repo.update).not.toHaveBeenCalled();
    });

    it("refuses a bad value before reading or writing anything", async () => {
        const { store, repo } = makeStore();

        await expect(store.updateTwilio({ accountSid: "nope" })).rejects.toMatchObject({ status: 400 });
        await expect(store.updateSmtp({ port: 0 })).rejects.toMatchObject({ status: 400 });
        expect(repo.findOne).not.toHaveBeenCalled();
        expect(repo.create).not.toHaveBeenCalled();
    });

    it("refuses to store a secret without a valid encryption key, rather than store it in the clear", async () => {
        for (const encryptionKey of ["", "abc"]) {
            const twilio = makeStore({ encryptionKey, configured: {} });
            await expect(twilio.store.updateTwilio({ token: "secret" })).rejects.toMatchObject({ status: 500, message: expect.stringContaining("encryption_key") });
            expect(twilio.repo.create).not.toHaveBeenCalled();
            expect(twilio.repo.update).not.toHaveBeenCalled();

            const smtp = makeStore({ encryptionKey, configured: {} });
            await expect(smtp.store.updateSmtp({ password: "secret" })).rejects.toMatchObject({ status: 500 });
        }
    });

    it("still saves the parts that aren't secrets without a key", async () => {
        const { store } = makeStore({ encryptionKey: "", configured: {} });

        await expect(store.updateTwilio({ accountSid: SID, from: "+15555550100" })).resolves.toMatchObject({ accountSid: SID, tokenSet: false });
    });

    it("reads back what the admin console shows without changing anything", async () => {
        const { store, repo } = makeStore();

        expect(await store.getTwilio()).toMatchObject({ accountSid: SID, tokenSet: true, from: "+15555550100", configured: true });
        expect(await store.getSmtp()).toMatchObject({ host: "smtp.config.test", port: 587, secure: false, user: "config-user", passwordSet: true, from: "config@acme.test", configured: true });
        expect(repo.update).not.toHaveBeenCalled();
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
        twilioAccountSid: OTHER_SID,
        twilioToken: encryptSecret("changed-token", KEY),
        fromSms: "Changed",
    };

    it("puts the SMTP settings back to what config says, encrypting the password, and leaves Twilio alone", async () => {
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
        // The other card's settings are exactly as they were.
        expect(getRow()).toMatchObject({ twilioAccountSid: OTHER_SID, twilioToken: CHANGED.twilioToken, fromSms: "Changed" });
    });

    it("puts the Twilio settings back to what config says, encrypting the token, and leaves SMTP alone", async () => {
        const { store, getRow } = makeStore({ row: CHANGED });

        const dto = await store.resetTwilio();

        expect(dto).toEqual({ accountSid: SID, tokenSet: true, from: "+15555550100", configured: true });
        expect(decryptSecret(getRow().twilioToken, KEY)).toBe("config-token");
        expect(getRow()).toMatchObject({
            smtpHost: "changed.test",
            smtpPort: 25,
            smtpSecure: true,
            smtpUser: "changed-user",
            smtpPassword: CHANGED.smtpPassword,
            fromEmail: "changed@acme.test",
        });
    });

    it("clears what config doesn't have, so the card matches config exactly", async () => {
        const { store, getRow } = makeStore({ row: CHANGED, configured: { smtp: { host: "only.test" }, from: { sms: "+15555550100" } } });

        const smtp = await store.resetSmtp();
        expect(smtp).toEqual({ host: "only.test", port: undefined, secure: false, user: undefined, passwordSet: false, from: undefined, configured: false });
        expect(getRow()).toMatchObject({ smtpPort: null, smtpSecure: null, smtpUser: null, smtpPassword: null, fromEmail: null });

        const twilio = await store.resetTwilio();
        expect(twilio).toEqual({ accountSid: undefined, tokenSet: false, from: "+15555550100", configured: false });
        expect(getRow()).toMatchObject({ twilioAccountSid: null, twilioToken: null });
    });

    it("clears everything in its group when config has nothing at all", async () => {
        const { store } = makeStore({ row: CHANGED, configured: {} });

        expect(await store.resetSmtp()).toMatchObject({ host: undefined, passwordSet: false, configured: false });
        expect(await store.resetTwilio()).toMatchObject({ accountSid: undefined, tokenSet: false, from: undefined, configured: false });
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
            await expect(store.resetTwilio()).rejects.toMatchObject({ status: 500 });
            expect(repo.update).not.toHaveBeenCalled();
        }
    });

    it("needs no key when config has no secret for that card", async () => {
        const { store } = makeStore({ row: CHANGED, encryptionKey: "", configured: { smtp: { host: "h" }, from: { email: "a@b.c" } } });

        await expect(store.resetSmtp()).resolves.toMatchObject({ host: "h", from: "a@b.c" });
    });

    it("reports a row that can't be read", async () => {
        const { store } = makeStore({ failFind: true });

        await expect(store.resetSmtp()).rejects.toThrow("db down");
    });
});
