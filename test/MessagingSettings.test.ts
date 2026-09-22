///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    effectiveSmsProvider,
    isSmsProvider,
    messagingFromConfig,
    seedFieldsFromConfig,
    smsCredentialsFrom,
    smtpOptionsFrom,
    toSmsSettingsDTO,
    toSmtpSettingsDTO,
    toWhatsAppSettingsDTO,
    TWILIO_ACCOUNT_SID_PATTERN,
    validateSmsInput,
    validateSmtpInput,
    validateWhatsAppInput,
    whatsAppCredentialsFrom,
} from "../src/messaging/MessagingSettings.js";

const SID = "AC" + "0123456789abcdef".repeat(2);
const PROFILE_ID = "40017a5c-2d1f-4d4e-9d0a-6a3f2d1b9c11";

describe("TWILIO_ACCOUNT_SID_PATTERN", () => {
    it("accepts AC followed by 32 hex digits, in either case", () => {
        expect(TWILIO_ACCOUNT_SID_PATTERN.test(SID)).toBe(true);
        expect(TWILIO_ACCOUNT_SID_PATTERN.test("AC" + "ABCDEF0123456789".repeat(2))).toBe(true);
    });

    it("rejects anything else, including an API key SID and text around a valid one", () => {
        for (const bad of ["", "AC123", "SK" + "0".repeat(32), "AC" + "g".repeat(32), ` ${SID}`, `${SID}0`]) {
            expect(TWILIO_ACCOUNT_SID_PATTERN.test(bad)).toBe(false);
        }
    });
});

describe("isSmsProvider", () => {
    it("knows exactly the providers core can send through", () => {
        expect(isSmsProvider("twilio")).toBe(true);
        expect(isSmsProvider("telnyx")).toBe(true);
    });

    it("refuses anything else, however close", () => {
        for (const bad of ["", "Twilio", "TELNYX", "vonage", " twilio", null, undefined, 1, {}, ["twilio"]]) {
            expect(isSmsProvider(bad), String(bad)).toBe(false);
        }
    });
});

describe("effectiveSmsProvider", () => {
    it("is the provider the row names, whatever credentials it holds", () => {
        expect(effectiveSmsProvider({ smsProvider: "telnyx", twilioAccountSid: SID, twilioToken: "enc" } as any)).toBe("telnyx");
        expect(effectiveSmsProvider({ smsProvider: "twilio", telnyxApiKey: "enc" } as any)).toBe("twilio");
        expect(effectiveSmsProvider({ smsProvider: "twilio" } as any)).toBe("twilio");
    });

    it("infers Twilio for a row from before there was a choice, from either half of its credentials", () => {
        expect(effectiveSmsProvider({ smsProvider: null, twilioAccountSid: SID } as any)).toBe("twilio");
        expect(effectiveSmsProvider({ twilioToken: "enc" } as any)).toBe("twilio");
        expect(effectiveSmsProvider({ twilioAccountSid: SID, twilioToken: "enc" } as any)).toBe("twilio");
    });

    it("prefers Twilio over Telnyx when a row with no choice has credentials for both", () => {
        expect(effectiveSmsProvider({ twilioToken: "enc", telnyxApiKey: "enc" } as any)).toBe("twilio");
    });

    it("infers Telnyx when it's the only one with credentials", () => {
        expect(effectiveSmsProvider({ smsProvider: null, telnyxApiKey: "enc" } as any)).toBe("telnyx");
        // A profile ID alone isn't a credential.
        expect(effectiveSmsProvider({ telnyxMessagingProfileId: PROFILE_ID } as any)).toBeUndefined();
    });

    it("is nothing for a row with neither a choice nor credentials", () => {
        expect(effectiveSmsProvider({} as any)).toBeUndefined();
        expect(effectiveSmsProvider({ smsProvider: null, twilioAccountSid: null, twilioToken: null, telnyxApiKey: null, fromSms: "+15555550100" } as any)).toBeUndefined();
    });
});

describe("smtpOptionsFrom", () => {
    it("has nothing without a host", () => {
        expect(smtpOptionsFrom({ port: 25 }, undefined, 25, undefined, undefined, undefined)).toBeUndefined();
        expect(smtpOptionsFrom(null, undefined, undefined, undefined, undefined, undefined)).toBeUndefined();
    });

    it("builds the modeled fields, leaving out the ones that aren't set", () => {
        expect(smtpOptionsFrom(null, "smtp.acme.test", undefined, undefined, undefined, undefined)).toEqual({ host: "smtp.acme.test" });
        expect(smtpOptionsFrom(null, "smtp.acme.test", 587, false, "user", "pass")).toEqual({
            host: "smtp.acme.test",
            port: 587,
            secure: false,
            auth: { user: "user", pass: "pass" },
        });
    });

    it("only authenticates with both a user and a password", () => {
        expect(smtpOptionsFrom(null, "h", undefined, undefined, "user", undefined)).toEqual({ host: "h" });
        expect(smtpOptionsFrom(null, "h", undefined, undefined, undefined, "pass")).toEqual({ host: "h" });
    });

    it("keeps the deployment's other nodemailer options, but never lets them override the modeled ones", () => {
        const options = smtpOptionsFrom(
            { host: "old.test", port: 25, secure: true, auth: { user: "old", pass: "old" }, tls: { rejectUnauthorized: false }, pool: true },
            "smtp.acme.test",
            587,
            false,
            undefined,
            undefined,
        );

        expect(options).toEqual({ tls: { rejectUnauthorized: false }, pool: true, host: "smtp.acme.test", port: 587, secure: false });
    });
});

describe("smsCredentialsFrom", () => {
    const ALL = {
        twilioAccountSid: SID,
        twilioToken: "t",
        twilioOptions: { region: "au1" },
        telnyxApiKey: "KEY",
        telnyxMessagingProfileId: PROFILE_ID,
    };

    it("is Twilio's credentials, and only them, when Twilio is the provider — with its options", () => {
        expect(smsCredentialsFrom("twilio", ALL)).toEqual({
            provider: "twilio",
            config: { accountSid: SID, token: "t", options: { region: "au1" } },
        });
    });

    it("is Telnyx's credentials, and only them, when Telnyx is the provider", () => {
        expect(smsCredentialsFrom("telnyx", ALL)).toEqual({
            provider: "telnyx",
            config: { apiKey: "KEY", messagingProfileId: PROFILE_ID },
        });
    });

    it("leaves the messaging profile out of Telnyx's credentials unless one is set", () => {
        const resolved = smsCredentialsFrom("telnyx", { telnyxApiKey: "KEY" });

        expect(resolved).toEqual({ provider: "telnyx", config: { apiKey: "KEY" } });
        expect(resolved?.config).not.toHaveProperty("messagingProfileId");
    });

    it("has nothing for Twilio unless both halves are there, however complete Telnyx is", () => {
        expect(smsCredentialsFrom("twilio", { ...ALL, twilioToken: undefined })).toBeUndefined();
        expect(smsCredentialsFrom("twilio", { ...ALL, twilioAccountSid: undefined })).toBeUndefined();
    });

    it("has nothing for Telnyx without an API key, however complete Twilio is (a profile ID alone isn't enough)", () => {
        expect(smsCredentialsFrom("telnyx", { ...ALL, telnyxApiKey: undefined })).toBeUndefined();
        expect(smsCredentialsFrom("telnyx", { telnyxMessagingProfileId: PROFILE_ID })).toBeUndefined();
    });

    it("has nothing when no provider is chosen, however many credentials there are", () => {
        expect(smsCredentialsFrom(undefined, ALL)).toBeUndefined();
    });
});

describe("whatsAppCredentialsFrom", () => {
    it("is the token and phone number ID, with the API version when there is one", () => {
        expect(whatsAppCredentialsFrom("tok", "12345678", "v22.0")).toEqual({ accessToken: "tok", phoneNumberId: "12345678", apiVersion: "v22.0" });
        const noVersion = whatsAppCredentialsFrom("tok", "12345678", undefined);
        expect(noVersion).toEqual({ accessToken: "tok", phoneNumberId: "12345678" });
        expect(noVersion).not.toHaveProperty("apiVersion");
    });

    it("has nothing unless there's both a token and a phone number ID", () => {
        expect(whatsAppCredentialsFrom(undefined, "12345678", "v22.0")).toBeUndefined();
        expect(whatsAppCredentialsFrom("tok", undefined, "v22.0")).toBeUndefined();
        expect(whatsAppCredentialsFrom(undefined, undefined, undefined)).toBeUndefined();
    });
});

describe("messagingFromConfig", () => {
    it("reads all four blocks, with Twilio as the SMS provider", () => {
        const resolved = messagingFromConfig({
            smtp: { host: "smtp.acme.test", port: 587, secure: false, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            sms: { provider: "twilio", config: { accountSid: SID, token: "t", options: { region: "au1" } } },
            whatsapp: { accessToken: "wa-token", phoneNumberId: "109876543210", apiVersion: "v22.0" },
        });

        expect(resolved).toEqual({
            smtp: { host: "smtp.acme.test", port: 587, secure: false, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            sms: { provider: "twilio", config: { accountSid: SID, token: "t", options: { region: "au1" } } },
            whatsapp: { accessToken: "wa-token", phoneNumberId: "109876543210", apiVersion: "v22.0" },
        });
    });

    it("reads Telnyx as the SMS provider", () => {
        const resolved = messagingFromConfig({
            sms: { provider: "telnyx", config: { apiKey: "KEY", messagingProfileId: PROFILE_ID } },
        });

        expect(resolved.sms).toEqual({ provider: "telnyx", config: { apiKey: "KEY", messagingProfileId: PROFILE_ID } });
    });

    it("only reads the provider `sms_config` names: the other's settings sitting beside it are ignored", () => {
        const twilio = messagingFromConfig({ sms: { provider: "twilio", config: { apiKey: "KEY", accountSid: SID, token: "t" } } });
        const telnyx = messagingFromConfig({ sms: { provider: "telnyx", config: { apiKey: "KEY", accountSid: SID, token: "t" } } });

        expect(twilio.sms).toEqual({ provider: "twilio", config: { accountSid: SID, token: "t", options: undefined } });
        expect(telnyx.sms).toEqual({ provider: "telnyx", config: { apiKey: "KEY" } });
    });

    it("treats a blank or missing value as unset", () => {
        expect(messagingFromConfig({})).toEqual({ smtp: undefined, from: { email: undefined, sms: undefined }, sms: undefined, whatsapp: undefined });
        expect(messagingFromConfig({ smtp: null, from: { email: "", sms: "" }, sms: null, whatsapp: null })).toEqual({
            smtp: undefined,
            from: { email: undefined, sms: undefined },
            sms: undefined,
            whatsapp: undefined,
        });
    });

    it("has no SMS provider for a blank, unknown or non-text `provider` — including the old top-level `twilio` block", () => {
        for (const provider of ["", "   ", "vonage", "Twilio", 5, {}, undefined]) {
            expect(messagingFromConfig({ sms: { provider: provider as any, config: { accountSid: SID, token: "t", apiKey: "KEY" } } }).sms, String(provider)).toBeUndefined();
        }
        expect(messagingFromConfig({ twilio: { accountSid: SID, token: "t" } } as any).sms).toBeUndefined();
    });

    it("tolerates a provider named without any config, and trims a provider name", () => {
        expect(messagingFromConfig({ sms: { provider: "twilio" } }).sms).toBeUndefined();
        expect(messagingFromConfig({ sms: { provider: "telnyx", config: {} } }).sms).toBeUndefined();
        expect(messagingFromConfig({ sms: { provider: " telnyx ", config: { apiKey: " KEY " } } }).sms).toEqual({
            provider: "telnyx",
            config: { apiKey: "KEY" },
        });
    });

    it("has no Twilio credentials unless both halves are there, and no Telnyx ones without an API key", () => {
        expect(messagingFromConfig({ sms: { provider: "twilio", config: { accountSid: SID } } }).sms).toBeUndefined();
        expect(messagingFromConfig({ sms: { provider: "twilio", config: { token: "t" } } }).sms).toBeUndefined();
        expect(messagingFromConfig({ sms: { provider: "telnyx", config: { messagingProfileId: PROFILE_ID } } }).sms).toBeUndefined();
        expect(messagingFromConfig({ sms: { provider: "twilio", config: { accountSid: SID, token: 7 } } }).sms).toBeUndefined();
    });

    it("has no WhatsApp credentials unless there's both a token and a phone number ID, and ignores an API version that's blank", () => {
        expect(messagingFromConfig({ whatsapp: { accessToken: "tok" } }).whatsapp).toBeUndefined();
        expect(messagingFromConfig({ whatsapp: { phoneNumberId: "12345678" } }).whatsapp).toBeUndefined();
        expect(messagingFromConfig({ whatsapp: { accessToken: "tok", phoneNumberId: "12345678", apiVersion: "  " } }).whatsapp).toEqual({
            accessToken: "tok",
            phoneNumberId: "12345678",
        });
    });

    it("keeps a secure: false, which is a value and not an absence", () => {
        expect(messagingFromConfig({ smtp: { host: "h", secure: false } }).smtp).toEqual({ host: "h", secure: false });
    });
});

describe("seedFieldsFromConfig", () => {
    it("splits what the config would seed into plain values and secrets, for Twilio", () => {
        const seed = seedFieldsFromConfig({
            smtp: { host: "smtp.acme.test", port: 587, secure: true, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            sms: { provider: "twilio", config: { accountSid: SID, token: "t" } },
            whatsapp: { accessToken: "wa-token", phoneNumberId: "109876543210", apiVersion: "v22.0" },
        });

        expect(seed.plain).toEqual({
            smtpHost: "smtp.acme.test",
            smtpPort: 587,
            smtpSecure: true,
            smtpUser: "u",
            fromEmail: "no-reply@acme.test",
            fromSms: "+15555550100",
            smsProvider: "twilio",
            twilioAccountSid: SID,
            telnyxMessagingProfileId: undefined,
            whatsappPhoneNumberId: "109876543210",
            whatsappApiVersion: "v22.0",
        });
        expect(seed.secrets).toEqual({ smtpPassword: "p", twilioToken: "t", telnyxApiKey: undefined, whatsappAccessToken: "wa-token" });
    });

    it("seeds Telnyx's settings, and none of Twilio's, when Telnyx is the provider", () => {
        const seed = seedFieldsFromConfig({
            sms: { provider: "telnyx", config: { apiKey: "KEY", messagingProfileId: PROFILE_ID, accountSid: SID, token: "t" } },
        });

        expect(seed.plain).toMatchObject({ smsProvider: "telnyx", telnyxMessagingProfileId: PROFILE_ID, twilioAccountSid: undefined });
        expect(seed.secrets).toMatchObject({ telnyxApiKey: "KEY", twilioToken: undefined });
    });

    it("seeds Twilio's settings, and none of Telnyx's, when Twilio is the provider", () => {
        const seed = seedFieldsFromConfig({
            sms: { provider: "twilio", config: { accountSid: SID, token: "t", apiKey: "KEY", messagingProfileId: PROFILE_ID } },
        });

        expect(seed.plain).toMatchObject({ smsProvider: "twilio", twilioAccountSid: SID, telnyxMessagingProfileId: undefined });
        expect(seed.secrets).toMatchObject({ twilioToken: "t", telnyxApiKey: undefined });
    });

    it("seeds no provider at all for one that's unknown, or when there's no `sms_config`", () => {
        for (const sms of [null, undefined, { provider: "vonage", config: { apiKey: "KEY" } }, { provider: "", config: {} }]) {
            const seed = seedFieldsFromConfig({ sms });
            expect(seed.plain.smsProvider, JSON.stringify(sms)).toBeUndefined();
            expect(seed.secrets.telnyxApiKey).toBeUndefined();
            expect(seed.secrets.twilioToken).toBeUndefined();
        }
    });

    it("seeds nothing for a blank or missing value", () => {
        const seed = seedFieldsFromConfig({ from: { email: "", sms: "" } });

        expect(Object.values(seed.plain).every((value) => value === undefined)).toBe(true);
        expect(Object.values(seed.secrets).every((value) => value === undefined)).toBe(true);
    });

    it("seeds nothing for an SMS or WhatsApp setting that's blank or isn't text", () => {
        const seed = seedFieldsFromConfig({
            sms: { provider: "twilio", config: { accountSid: "  ", token: 5 } },
            whatsapp: { accessToken: "", phoneNumberId: "   ", apiVersion: 23 as any },
        });

        expect(seed.plain).toMatchObject({ smsProvider: "twilio", twilioAccountSid: undefined, whatsappPhoneNumberId: undefined, whatsappApiVersion: undefined });
        expect(seed.secrets).toMatchObject({ twilioToken: undefined, whatsappAccessToken: undefined });
    });
});

describe("the DTOs", () => {
    const TWILIO_ROW = { smsProvider: "twilio", twilioAccountSid: SID, twilioToken: "enc", fromSms: "+15555550100" };
    const TELNYX_ROW = { smsProvider: "telnyx", telnyxApiKey: "enc", telnyxMessagingProfileId: PROFILE_ID, fromSms: "+15555550100" };

    it("say whether a text could be sent through Twilio: an account, a token and a sender", () => {
        expect(toSmsSettingsDTO(TWILIO_ROW as any)).toEqual({
            provider: "twilio",
            twilio: { accountSid: SID, tokenSet: true },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: "+15555550100",
            configured: true,
        });
        for (const missing of ["twilioAccountSid", "twilioToken", "fromSms"]) {
            const row: any = { ...TWILIO_ROW, [missing]: null };
            expect(toSmsSettingsDTO(row).configured, missing).toBe(false);
        }
    });

    it("say whether a text could be sent through Telnyx: an API key and a sender (the profile is optional)", () => {
        expect(toSmsSettingsDTO(TELNYX_ROW as any)).toEqual({
            provider: "telnyx",
            twilio: { accountSid: undefined, tokenSet: false },
            telnyx: { apiKeySet: true, messagingProfileId: PROFILE_ID },
            from: "+15555550100",
            configured: true,
        });
        expect(toSmsSettingsDTO({ ...TELNYX_ROW, telnyxMessagingProfileId: null } as any).configured).toBe(true);
        for (const missing of ["telnyxApiKey", "fromSms"]) {
            const row: any = { ...TELNYX_ROW, [missing]: null };
            expect(toSmsSettingsDTO(row).configured, missing).toBe(false);
        }
    });

    it("only count the chosen provider's credentials towards `configured`", () => {
        // Telnyx is complete but Twilio is chosen, with no Twilio credentials.
        expect(toSmsSettingsDTO({ ...TELNYX_ROW, smsProvider: "twilio" } as any)).toMatchObject({ provider: "twilio", configured: false });
        // And the other way round.
        expect(toSmsSettingsDTO({ ...TWILIO_ROW, smsProvider: "telnyx" } as any)).toMatchObject({ provider: "telnyx", configured: false });
    });

    it("keep the other provider's saved settings visible even though they play no part", () => {
        const dto = toSmsSettingsDTO({ ...TWILIO_ROW, smsProvider: "telnyx", telnyxApiKey: "enc" } as any);

        expect(dto.twilio).toEqual({ accountSid: SID, tokenSet: true });
        expect(dto.telnyx.apiKeySet).toBe(true);
        expect(dto.provider).toBe("telnyx");
    });

    it("show the inferred provider for a row with no choice, and none when there's nothing to infer it from", () => {
        expect(toSmsSettingsDTO({ smsProvider: null, twilioAccountSid: SID, twilioToken: "enc", fromSms: "+1555" } as any)).toMatchObject({ provider: "twilio", configured: true });
        expect(toSmsSettingsDTO({ smsProvider: null, telnyxApiKey: "enc", fromSms: "+1555" } as any)).toMatchObject({ provider: "telnyx", configured: true });
        expect(toSmsSettingsDTO({ smsProvider: null, fromSms: "+1555" } as any)).toMatchObject({ provider: undefined, configured: false });
    });

    it("treat a null column the same as an absent field", () => {
        expect(
            toSmsSettingsDTO({
                smsProvider: null,
                twilioAccountSid: null,
                twilioToken: null,
                telnyxApiKey: null,
                telnyxMessagingProfileId: null,
                fromSms: null,
            } as any),
        ).toEqual({
            provider: undefined,
            twilio: { accountSid: undefined, tokenSet: false },
            telnyx: { apiKeySet: false, messagingProfileId: undefined },
            from: undefined,
            configured: false,
        });
    });

    it("say whether a WhatsApp message could be sent: an access token and a phone number ID", () => {
        expect(toWhatsAppSettingsDTO({ whatsappPhoneNumberId: "109876543210", whatsappAccessToken: "enc", whatsappApiVersion: "v22.0" } as any)).toEqual({
            phoneNumberId: "109876543210",
            accessTokenSet: true,
            apiVersion: "v22.0",
            configured: true,
        });
        expect(toWhatsAppSettingsDTO({ whatsappPhoneNumberId: "109876543210" } as any)).toMatchObject({ accessTokenSet: false, configured: false });
        expect(toWhatsAppSettingsDTO({ whatsappAccessToken: "enc" } as any)).toMatchObject({ accessTokenSet: true, phoneNumberId: undefined, configured: false });
    });

    it("show a null WhatsApp column as nothing set", () => {
        expect(toWhatsAppSettingsDTO({ whatsappPhoneNumberId: null, whatsappAccessToken: null, whatsappApiVersion: null } as any)).toEqual({
            phoneNumberId: undefined,
            accessTokenSet: false,
            apiVersion: undefined,
            configured: false,
        });
    });

    it("say whether an e-mail could be sent: a host and a sender", () => {
        expect(
            toSmtpSettingsDTO({ smtpHost: "h", smtpPort: 587, smtpSecure: true, smtpUser: "u", smtpPassword: "enc", fromEmail: "a@b.c" } as any),
        ).toEqual({ host: "h", port: 587, secure: true, user: "u", passwordSet: true, from: "a@b.c", configured: true });
        expect(toSmtpSettingsDTO({ smtpHost: "h" } as any).configured).toBe(false);
        expect(toSmtpSettingsDTO({ fromEmail: "a@b.c" } as any).configured).toBe(false);
    });

    it("show an empty SMTP row as insecure with nothing set", () => {
        expect(toSmtpSettingsDTO({ smtpHost: null, smtpPort: null, smtpSecure: null, smtpUser: null, smtpPassword: null, fromEmail: null } as any)).toEqual({
            host: undefined,
            port: undefined,
            secure: false,
            user: undefined,
            passwordSet: false,
            from: undefined,
            configured: false,
        });
    });

    it("have no way to carry a secret", () => {
        const sms = toSmsSettingsDTO({ ...TWILIO_ROW, twilioToken: "enc:v1:secret", telnyxApiKey: "enc:v1:secret" } as any);
        const whatsapp = toWhatsAppSettingsDTO({ whatsappPhoneNumberId: "109876543210", whatsappAccessToken: "enc:v1:secret" } as any);
        const smtp = toSmtpSettingsDTO({ smtpHost: "h", smtpPassword: "enc:v1:secret", fromEmail: "a@b.c" } as any);

        expect(Object.keys(sms).sort()).toEqual(["configured", "from", "provider", "telnyx", "twilio"]);
        expect(Object.keys(sms.twilio).sort()).toEqual(["accountSid", "tokenSet"]);
        expect(Object.keys(sms.telnyx).sort()).toEqual(["apiKeySet", "messagingProfileId"]);
        expect(Object.keys(whatsapp).sort()).toEqual(["accessTokenSet", "apiVersion", "configured", "phoneNumberId"]);
        expect(Object.keys(smtp).sort()).toEqual(["configured", "from", "host", "passwordSet", "port", "secure", "user"]);
        expect(JSON.stringify([sms, whatsapp, smtp])).not.toContain("secret");
    });
});

describe("validateSmsInput", () => {
    it("checks nothing that wasn't sent", () => {
        expect(validateSmsInput({})).toEqual({ fields: {}, secrets: {} });
    });

    it("accepts either provider, and null to go back to whichever has credentials", () => {
        expect(validateSmsInput({ provider: "twilio" }).fields.smsProvider).toBe("twilio");
        expect(validateSmsInput({ provider: "telnyx" }).fields.smsProvider).toBe("telnyx");
        expect(validateSmsInput({ provider: null }).fields.smsProvider).toBeNull();
    });

    it("refuses a provider that isn't one, however close, and says which are", () => {
        for (const provider of ["vonage", "", "Twilio", "TELNYX", " twilio", 1 as any, {} as any, true as any]) {
            expect(() => validateSmsInput({ provider }), String(provider)).toThrow("The provider must be one of: twilio, telnyx.");
        }
    });

    it("trims and accepts a valid SID, and treats null or blank as clearing it", () => {
        expect(validateSmsInput({ twilio: { accountSid: `  ${SID}  ` } }).fields.twilioAccountSid).toBe(SID);
        expect(validateSmsInput({ twilio: { accountSid: null } }).fields.twilioAccountSid).toBeNull();
        expect(validateSmsInput({ twilio: { accountSid: "   " } }).fields.twilioAccountSid).toBeNull();
    });

    it("refuses a SID that isn't one, or isn't text", () => {
        for (const accountSid of ["not-a-sid", "AC123", 5 as any, {} as any]) {
            expect(() => validateSmsInput({ twilio: { accountSid } })).toThrow("'AC' followed by 32 hexadecimal digits");
        }
    });

    it("accepts a phone number or an alphanumeric sender ID as the sender", () => {
        for (const from of ["+15555550100", "+442071838750", "Acme", "Acme Corp", "Acme1"]) {
            expect(validateSmsInput({ from }).fields.fromSms, from).toBe(from);
        }
        expect(validateSmsInput({ from: null }).fields.fromSms).toBeNull();
        expect(validateSmsInput({ from: "  " }).fields.fromSms).toBeNull();
    });

    it("refuses a sender that can't be right", () => {
        for (const from of ["5555550100", "+0555555", "+1", "12345", "Way Too Long Sender", "Acme!", "MG" + "0".repeat(32).slice(0, 5) + "!", 5 as any]) {
            expect(() => validateSmsInput({ from }), String(from)).toThrow("phone number in international format");
        }
    });

    it("trims a Twilio token, refuses one that's empty, too long or not text, and lets null clear it", () => {
        expect(validateSmsInput({ twilio: { token: "  abc  " } }).secrets.twilioToken).toBe("abc");
        expect(validateSmsInput({ twilio: { token: null } }).secrets.twilioToken).toBeNull();
        for (const token of ["", "   ", "x".repeat(257), 9 as any]) {
            expect(() => validateSmsInput({ twilio: { token } }), String(token)).toThrow("The auth token must be a non-empty string.");
        }
    });

    it("trims a Telnyx API key, refuses one that's empty, too long or not text, and lets null clear it", () => {
        expect(validateSmsInput({ telnyx: { apiKey: "  KEY0123  " } }).secrets.telnyxApiKey).toBe("KEY0123");
        expect(validateSmsInput({ telnyx: { apiKey: null } }).secrets.telnyxApiKey).toBeNull();
        for (const apiKey of ["", "   ", "x".repeat(257), 9 as any]) {
            expect(() => validateSmsInput({ telnyx: { apiKey } }), String(apiKey)).toThrow("The API key must be a non-empty string.");
        }
    });

    it("accepts a Telnyx messaging profile ID, trimmed, and treats null or blank as clearing it", () => {
        for (const id of [PROFILE_ID, "abc123", "A-b-C-1", "x".repeat(64)]) {
            expect(validateSmsInput({ telnyx: { messagingProfileId: `  ${id} ` } }).fields.telnyxMessagingProfileId, id).toBe(id);
        }
        expect(validateSmsInput({ telnyx: { messagingProfileId: null } }).fields.telnyxMessagingProfileId).toBeNull();
        expect(validateSmsInput({ telnyx: { messagingProfileId: "  " } }).fields.telnyxMessagingProfileId).toBeNull();
    });

    it("refuses a messaging profile ID with anything but letters, digits and dashes, or that isn't text", () => {
        for (const messagingProfileId of ["has space", "under_score", "semi;colon", "../../x", "x".repeat(65), "üñí", 5 as any, {} as any]) {
            expect(() => validateSmsInput({ telnyx: { messagingProfileId } }), String(messagingProfileId)).toThrow(
                "The messaging profile ID must be letters, digits and dashes",
            );
        }
    });

    it("reads one provider's block without touching the other's, whichever is chosen", () => {
        const { fields, secrets } = validateSmsInput({ provider: "telnyx", twilio: { token: "t" }, telnyx: { messagingProfileId: PROFILE_ID } });

        expect(fields).toEqual({ smsProvider: "telnyx", telnyxMessagingProfileId: PROFILE_ID });
        expect(secrets).toEqual({ twilioToken: "t" });
    });

    it("refuses a `twilio` or `telnyx` that isn't an object", () => {
        for (const value of [null, "x", 5, true, [], ["accountSid"]]) {
            expect(() => validateSmsInput({ twilio: value as any }), `twilio ${JSON.stringify(value)}`).toThrow("`twilio` must be an object.");
            expect(() => validateSmsInput({ telnyx: value as any }), `telnyx ${JSON.stringify(value)}`).toThrow("`telnyx` must be an object.");
        }
    });

    it("accepts an empty `twilio` or `telnyx` object as nothing to change", () => {
        expect(validateSmsInput({ twilio: {}, telnyx: {} })).toEqual({ fields: {}, secrets: {} });
    });

    it("refuses with a 400 (invalid request)", () => {
        expect(() => validateSmsInput({ provider: "nope" as any })).toThrow(expect.objectContaining({ status: 400 }));
    });
});

describe("validateWhatsAppInput", () => {
    it("checks nothing that wasn't sent", () => {
        expect(validateWhatsAppInput({})).toEqual({ fields: {}, accessToken: undefined });
    });

    it("accepts a phone number ID of digits, trimmed, and treats null or blank as clearing it", () => {
        for (const id of ["12345", "109876543210", "1".repeat(32)]) {
            expect(validateWhatsAppInput({ phoneNumberId: ` ${id} ` }).fields.whatsappPhoneNumberId, id).toBe(id);
        }
        expect(validateWhatsAppInput({ phoneNumberId: null }).fields.whatsappPhoneNumberId).toBeNull();
        expect(validateWhatsAppInput({ phoneNumberId: "  " }).fields.whatsappPhoneNumberId).toBeNull();
    });

    it("refuses a phone number ID that isn't Meta's digits — a phone number, too short or long, or not text", () => {
        for (const phoneNumberId of ["+15555550100", "1234", "1".repeat(33), "12a45", "1234 5678", 123456 as any, {} as any]) {
            expect(() => validateWhatsAppInput({ phoneNumberId }), String(phoneNumberId)).toThrow("The phone number ID must be the digits Meta shows");
        }
    });

    it("accepts a Graph API version like v23.0, trimmed, and treats null or blank as clearing it", () => {
        for (const apiVersion of ["v23.0", "v9.0", "v100.12", "v1.1"]) {
            expect(validateWhatsAppInput({ apiVersion: ` ${apiVersion} ` }).fields.whatsappApiVersion, apiVersion).toBe(apiVersion);
        }
        expect(validateWhatsAppInput({ apiVersion: null }).fields.whatsappApiVersion).toBeNull();
        expect(validateWhatsAppInput({ apiVersion: "" }).fields.whatsappApiVersion).toBeNull();
    });

    it("refuses an API version that doesn't look like one, or isn't text", () => {
        for (const apiVersion of ["23.0", "v23", "V23.0", "v23.0.1", "v1000.0", "v23.100", "latest", "v23/../x", 23 as any]) {
            expect(() => validateWhatsAppInput({ apiVersion }), String(apiVersion)).toThrow("The API version must look like v23.0.");
        }
    });

    it("trims an access token, refuses one that's empty, too long or not text, and lets null clear it", () => {
        expect(validateWhatsAppInput({ accessToken: "  EAAG  " }).accessToken).toBe("EAAG");
        expect(validateWhatsAppInput({ accessToken: null }).accessToken).toBeNull();
        for (const accessToken of ["", "   ", "x".repeat(257), 9 as any]) {
            expect(() => validateWhatsAppInput({ accessToken }), String(accessToken)).toThrow("The access token must be a non-empty string.");
        }
    });

    it("returns the token apart from the fields, so the caller can encrypt it", () => {
        expect(validateWhatsAppInput({ phoneNumberId: "12345678", accessToken: "tok", apiVersion: "v22.0" })).toEqual({
            fields: { whatsappPhoneNumberId: "12345678", whatsappApiVersion: "v22.0" },
            accessToken: "tok",
        });
    });
});

describe("validateSmtpInput", () => {
    it("checks nothing that wasn't sent", () => {
        expect(validateSmtpInput({})).toEqual({ fields: {}, password: undefined });
    });

    it("accepts a host name or address, and clears on null or blank", () => {
        for (const host of ["smtp.acme.test", "localhost", "10.0.0.5", "::1", "mail_relay-1.internal"]) {
            expect(validateSmtpInput({ host }).fields.smtpHost, host).toBe(host);
        }
        expect(validateSmtpInput({ host: "  smtp.acme.test  " }).fields.smtpHost).toBe("smtp.acme.test");
        expect(validateSmtpInput({ host: null }).fields.smtpHost).toBeNull();
        expect(validateSmtpInput({ host: " " }).fields.smtpHost).toBeNull();
    });

    it("refuses a host with a scheme, port, path or spaces, or that isn't text", () => {
        for (const host of ["smtp://acme.test", "acme.test:587/x", "acme test", "a".repeat(256), 5 as any]) {
            expect(() => validateSmtpInput({ host }), String(host)).toThrow("host name or IP address");
        }
    });

    it("accepts a whole port from 1 to 65535, and clears on null", () => {
        for (const port of [1, 25, 587, 65535]) {
            expect(validateSmtpInput({ port }).fields.smtpPort).toBe(port);
        }
        expect(validateSmtpInput({ port: null }).fields.smtpPort).toBeNull();
    });

    it("refuses a port that isn't a whole number in range", () => {
        for (const port of [0, -1, 65536, 587.5, "587" as any, NaN]) {
            expect(() => validateSmtpInput({ port }), String(port)).toThrow("whole number from 1 to 65535");
        }
    });

    it("accepts true, false or null for secure, and refuses anything else", () => {
        expect(validateSmtpInput({ secure: true }).fields.smtpSecure).toBe(true);
        expect(validateSmtpInput({ secure: false }).fields.smtpSecure).toBe(false);
        expect(validateSmtpInput({ secure: null }).fields.smtpSecure).toBeNull();
        expect(() => validateSmtpInput({ secure: "yes" as any })).toThrow("`secure` must be true, false or null.");
    });

    it("accepts a user name, trimmed, and refuses one that's absurdly long or not text", () => {
        expect(validateSmtpInput({ user: "  mailer  " }).fields.smtpUser).toBe("mailer");
        expect(validateSmtpInput({ user: null }).fields.smtpUser).toBeNull();
        expect(() => validateSmtpInput({ user: "u".repeat(257) })).toThrow("user name");
        expect(() => validateSmtpInput({ user: 3 as any })).toThrow("user name");
    });

    it("accepts an address or a named address as the sender", () => {
        for (const from of ["no-reply@acme.test", "Acme <no-reply@acme.test>", "Acme Corp, Inc. <a@b.co>"]) {
            expect(validateSmtpInput({ from }).fields.fromEmail, from).toBe(from);
        }
        expect(validateSmtpInput({ from: null }).fields.fromEmail).toBeNull();
    });

    it("refuses a sender that isn't an address, and any line break — which would let a header be injected", () => {
        const problem = "The sender must be an e-mail address";
        for (const from of ["not-an-address", "a@", "@b.c", "a b@c.d", "a@b.c\nBcc: x@y.z", "Acme <a@b.c>\r\nBcc: x@y.z", "Acme <a@b.c", `${"a".repeat(320)}@b.c`, 5 as any]) {
            expect(() => validateSmtpInput({ from }), JSON.stringify(from)).toThrow(problem);
        }
    });

    it("keeps a password exactly as given, spaces included, and refuses one that's empty, too long or not text", () => {
        expect(validateSmtpInput({ password: "  spaced pass  " }).password).toBe("  spaced pass  ");
        expect(validateSmtpInput({ password: null }).password).toBeNull();
        for (const password of ["", "   ", "x".repeat(257), 1 as any]) {
            expect(() => validateSmtpInput({ password }), String(password)).toThrow("The password must be a non-empty string.");
        }
    });
});
