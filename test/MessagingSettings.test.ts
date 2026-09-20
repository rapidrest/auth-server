///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    messagingFromConfig,
    seedFieldsFromConfig,
    smtpOptionsFrom,
    toSmtpSettingsDTO,
    toTwilioSettingsDTO,
    TWILIO_ACCOUNT_SID_PATTERN,
    validateSmtpInput,
    validateTwilioInput,
} from "../src/messaging/MessagingSettings.js";

const SID = "AC" + "0123456789abcdef".repeat(2);

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

describe("messagingFromConfig", () => {
    it("reads all three blocks", () => {
        const resolved = messagingFromConfig({
            smtp: { host: "smtp.acme.test", port: 587, secure: false, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            twilio: { accountSid: SID, token: "t", options: { region: "au1" } },
        });

        expect(resolved).toEqual({
            smtp: { host: "smtp.acme.test", port: 587, secure: false, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            twilio: { accountSid: SID, token: "t", options: { region: "au1" } },
        });
    });

    it("treats a blank or missing value as unset", () => {
        expect(messagingFromConfig({})).toEqual({ smtp: undefined, from: { email: undefined, sms: undefined }, twilio: undefined });
        expect(messagingFromConfig({ smtp: null, from: { email: "", sms: "" }, twilio: null })).toEqual({
            smtp: undefined,
            from: { email: undefined, sms: undefined },
            twilio: undefined,
        });
    });

    it("has no Twilio credentials unless both halves are there", () => {
        expect(messagingFromConfig({ twilio: { accountSid: SID } }).twilio).toBeUndefined();
        expect(messagingFromConfig({ twilio: { token: "t" } }).twilio).toBeUndefined();
    });

    it("keeps a secure: false, which is a value and not an absence", () => {
        expect(messagingFromConfig({ smtp: { host: "h", secure: false } }).smtp).toEqual({ host: "h", secure: false });
    });
});

describe("seedFieldsFromConfig", () => {
    it("splits what the config would seed into plain values and secrets", () => {
        const seed = seedFieldsFromConfig({
            smtp: { host: "smtp.acme.test", port: 587, secure: true, auth: { user: "u", pass: "p" } },
            from: { email: "no-reply@acme.test", sms: "+15555550100" },
            twilio: { accountSid: SID, token: "t" },
        });

        expect(seed.plain).toEqual({
            smtpHost: "smtp.acme.test",
            smtpPort: 587,
            smtpSecure: true,
            smtpUser: "u",
            fromEmail: "no-reply@acme.test",
            fromSms: "+15555550100",
            twilioAccountSid: SID,
        });
        expect(seed.secrets).toEqual({ smtpPassword: "p", twilioToken: "t" });
    });

    it("seeds nothing for a blank or missing value", () => {
        const seed = seedFieldsFromConfig({ from: { email: "", sms: "" } });

        expect(Object.values(seed.plain).every((value) => value === undefined)).toBe(true);
        expect(Object.values(seed.secrets).every((value) => value === undefined)).toBe(true);
    });
});

describe("the DTOs", () => {
    it("say whether a text could be sent: an account, a token and a sender", () => {
        expect(toTwilioSettingsDTO({ twilioAccountSid: SID, twilioToken: "enc", fromSms: "+15555550100" } as any)).toEqual({
            accountSid: SID,
            tokenSet: true,
            from: "+15555550100",
            configured: true,
        });
        for (const missing of ["twilioAccountSid", "twilioToken", "fromSms"]) {
            const row: any = { twilioAccountSid: SID, twilioToken: "enc", fromSms: "+15555550100", [missing]: null };
            expect(toTwilioSettingsDTO(row).configured, missing).toBe(false);
        }
    });

    it("treat a null column the same as an absent field", () => {
        expect(toTwilioSettingsDTO({ twilioAccountSid: null, twilioToken: null, fromSms: null } as any)).toEqual({
            accountSid: undefined,
            tokenSet: false,
            from: undefined,
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
        const twilio = toTwilioSettingsDTO({ twilioAccountSid: SID, twilioToken: "enc:v1:secret", fromSms: "+1" } as any);
        const smtp = toSmtpSettingsDTO({ smtpHost: "h", smtpPassword: "enc:v1:secret", fromEmail: "a@b.c" } as any);

        expect(Object.keys(twilio).sort()).toEqual(["accountSid", "configured", "from", "tokenSet"]);
        expect(Object.keys(smtp).sort()).toEqual(["configured", "from", "host", "passwordSet", "port", "secure", "user"]);
        expect(JSON.stringify([twilio, smtp])).not.toContain("secret");
    });
});

describe("validateTwilioInput", () => {
    it("checks nothing that wasn't sent", () => {
        expect(validateTwilioInput({})).toEqual({ fields: {}, token: undefined });
    });

    it("trims and accepts a valid SID, and treats null or blank as clearing it", () => {
        expect(validateTwilioInput({ accountSid: `  ${SID}  ` }).fields.twilioAccountSid).toBe(SID);
        expect(validateTwilioInput({ accountSid: null }).fields.twilioAccountSid).toBeNull();
        expect(validateTwilioInput({ accountSid: "   " }).fields.twilioAccountSid).toBeNull();
    });

    it("refuses a SID that isn't one, or isn't text", () => {
        for (const accountSid of ["not-a-sid", "AC123", 5 as any, {} as any]) {
            expect(() => validateTwilioInput({ accountSid })).toThrow("'AC' followed by 32 hexadecimal digits");
        }
    });

    it("accepts a phone number or an alphanumeric sender ID as the sender", () => {
        for (const from of ["+15555550100", "+442071838750", "Acme", "Acme Corp", "Acme1"]) {
            expect(validateTwilioInput({ from }).fields.fromSms, from).toBe(from);
        }
        expect(validateTwilioInput({ from: null }).fields.fromSms).toBeNull();
        expect(validateTwilioInput({ from: "  " }).fields.fromSms).toBeNull();
    });

    it("refuses a sender that can't be right", () => {
        for (const from of ["5555550100", "+0555555", "+1", "12345", "Way Too Long Sender", "Acme!", "MG" + "0".repeat(32).slice(0, 5) + "!", 5 as any]) {
            expect(() => validateTwilioInput({ from }), String(from)).toThrow("phone number in international format");
        }
    });

    it("trims a token, refuses one that's empty, too long or not text, and lets null clear it", () => {
        expect(validateTwilioInput({ token: "  abc  " }).token).toBe("abc");
        expect(validateTwilioInput({ token: null }).token).toBeNull();
        for (const token of ["", "   ", "x".repeat(257), 9 as any]) {
            expect(() => validateTwilioInput({ token }), String(token)).toThrow("The auth token must be a non-empty string.");
        }
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
