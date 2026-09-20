///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { MessagingSettingsMongo } from "../src/models/mongo/MessagingSettingsMongo.js";
import { MessagingSettingsSQL } from "../src/models/sql/MessagingSettingsSQL.js";

describe.each([
    ["MessagingSettingsSQL", MessagingSettingsSQL],
    ["MessagingSettingsMongo", MessagingSettingsMongo],
] as const)("%s", (_name, Model) => {
    it("starts with nothing set", () => {
        const settings = new Model();

        expect(settings.twilioAccountSid).toBeUndefined();
        expect(settings.twilioToken).toBeUndefined();
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

    it("keeps a null, which is how a cleared column comes back, rather than treating it as unset", () => {
        const settings = new Model({ twilioAccountSid: null as any, twilioToken: null as any });

        expect(settings.twilioAccountSid).toBeNull();
        expect(settings.twilioToken).toBeNull();
    });
});
