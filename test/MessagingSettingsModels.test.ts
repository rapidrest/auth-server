///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { MessagingSettingsMongo } from "../src/models/mongo/MessagingSettingsMongo.js";
import { MessagingSettingsSQL } from "../src/models/sql/MessagingSettingsSQL.js";

/** Every field the row can hold, and a value for each — so that one left out of the constructor shows up here. */
const EVERY_FIELD = {
    smtpHost: "smtp.acme.test",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "mailer",
    smtpPassword: "enc:v1:smtp",
    fromEmail: "no-reply@acme.test",
    smsProvider: "telnyx",
    twilioAccountSid: "AC1",
    twilioToken: "enc:v1:twilio",
    telnyxApiKey: "enc:v1:telnyx",
    telnyxMessagingProfileId: "40017a5c-2d1f-4d4e-9d0a-6a3f2d1b9c11",
    fromSms: "+15555550100",
    whatsappPhoneNumberId: "109876543210",
    whatsappAccessToken: "enc:v1:whatsapp",
    whatsappApiVersion: "v23.0",
    seeded: true,
};

describe.each([
    ["MessagingSettingsSQL", MessagingSettingsSQL],
    ["MessagingSettingsMongo", MessagingSettingsMongo],
] as const)("%s", (_name, Model) => {
    it("starts with nothing set", () => {
        const settings = new Model();

        expect(settings.twilioAccountSid).toBeUndefined();
        expect(settings.twilioToken).toBeUndefined();
        for (const field of Object.keys(EVERY_FIELD)) {
            expect((settings as any)[field], field).toBeUndefined();
        }
    });

    it("takes whichever fields it's given, leaving the rest unset", () => {
        expect(new Model({ twilioAccountSid: "AC1" })).toMatchObject({ twilioAccountSid: "AC1", twilioToken: undefined });
        expect(new Model({ twilioToken: "enc:v1:x" })).toMatchObject({ twilioAccountSid: undefined, twilioToken: "enc:v1:x" });
    });

    it("takes the SMTP settings, the sender addresses and the seeded marker the same way", () => {
        const settings = new Model({
            smtpHost: "smtp.acme.test",
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: "mailer",
            smtpPassword: "enc:v1:x",
            fromEmail: "no-reply@acme.test",
            fromSms: "+15555550100",
            seeded: true,
        });

        expect(settings).toMatchObject({
            smtpHost: "smtp.acme.test",
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: "mailer",
            smtpPassword: "enc:v1:x",
            fromEmail: "no-reply@acme.test",
            fromSms: "+15555550100",
            seeded: true,
        });
        expect(new Model({ seeded: true })).toMatchObject({ seeded: true, smtpHost: undefined, fromEmail: undefined });
    });

    it("takes the SMS provider and Telnyx's settings, apart from Twilio's", () => {
        const settings = new Model({ smsProvider: "telnyx", telnyxApiKey: "enc:v1:k", telnyxMessagingProfileId: "profile-1" });

        expect(settings).toMatchObject({
            smsProvider: "telnyx",
            telnyxApiKey: "enc:v1:k",
            telnyxMessagingProfileId: "profile-1",
            twilioAccountSid: undefined,
            twilioToken: undefined,
        });
        expect(new Model({ twilioAccountSid: "AC1" })).toMatchObject({ smsProvider: undefined, telnyxApiKey: undefined, telnyxMessagingProfileId: undefined });
    });

    it("takes the WhatsApp settings", () => {
        const settings = new Model({ whatsappPhoneNumberId: "109876543210", whatsappAccessToken: "enc:v1:w", whatsappApiVersion: "v23.0" });

        expect(settings).toMatchObject({ whatsappPhoneNumberId: "109876543210", whatsappAccessToken: "enc:v1:w", whatsappApiVersion: "v23.0" });
        expect(new Model({ whatsappApiVersion: "v22.0" })).toMatchObject({ whatsappPhoneNumberId: undefined, whatsappAccessToken: undefined });
    });

    it("takes every field it has a column for, each on its own", () => {
        expect(new Model(EVERY_FIELD as any)).toMatchObject(EVERY_FIELD);
        for (const [field, value] of Object.entries(EVERY_FIELD)) {
            const settings = new Model({ [field]: value }) as any;

            expect(settings[field], field).toEqual(value);
            expect(
                Object.keys(EVERY_FIELD).filter((other) => other !== field && settings[other] !== undefined),
                `only ${field}`,
            ).toEqual([]);
        }
    });

    it("keeps a null, which is how a cleared column comes back, rather than treating it as unset", () => {
        const settings = new Model({ twilioAccountSid: null as any, twilioToken: null as any });

        expect(settings.twilioAccountSid).toBeNull();
        expect(settings.twilioToken).toBeNull();
    });

    it("keeps a null for every field, including the new SMS and WhatsApp ones", () => {
        const settings = new Model(Object.fromEntries(Object.keys(EVERY_FIELD).map((field) => [field, null]))) as any;

        for (const field of Object.keys(EVERY_FIELD)) {
            expect(settings[field], field).toBeNull();
        }
    });
});
