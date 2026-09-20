// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    getMessageTemplate,
    getSmtpSettings,
    getTwilioSettings,
    listMessageTemplates,
    previewMessageTemplate,
    resetMessageTemplate,
    resetSmtpSettings,
    resetTwilioSettings,
    updateMessageTemplate,
    updateSmtpSettings,
    updateTwilioSettings,
} from "../../../apps/shared/lib/messagingApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("message templates", () => {
    it("listMessageTemplates GETs /settings/messages", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [{ name: "login-otp", customized: false, enabled: true }]));

        const result = await listMessageTemplates();

        expect(fetchMock).toHaveBeenCalledWith("/api/settings/messages", expect.anything());
        expect(result).toEqual([{ name: "login-otp", customized: false, enabled: true }]);
    });

    it("getMessageTemplate GETs the template by its encoded name", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { name: "login-otp" }));

        await getMessageTemplate("login-otp");
        await getMessageTemplate("a/b c");

        expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/settings/messages/login-otp", expect.anything());
        expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/settings/messages/a%2Fb%20c", expect.anything());
    });

    it("updateMessageTemplate PUTs the edits, nulls included", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { name: "login-otp" }));

        await updateMessageTemplate("login-otp", { subject: "New", html: null, enabled: false });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/messages/login-otp",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ subject: "New", html: null, enabled: false }) }),
        );
    });

    it("resetMessageTemplate DELETEs the template's edits", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { name: "login-otp" }));

        await resetMessageTemplate("login-otp");

        expect(fetchMock).toHaveBeenCalledWith("/api/settings/messages/login-otp", expect.objectContaining({ method: "DELETE" }));
    });

    it("previewMessageTemplate POSTs the draft to the template's preview endpoint", async () => {
        const rendered = { subject: "S", text: "T", html: null, sms: null };
        const fetchMock = mockFetch(() => jsonResponse(200, rendered));

        const result = await previewMessageTemplate("login-otp", { sms: "Draft" });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/messages/login-otp/preview",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ sms: "Draft" }) }),
        );
        expect(result).toEqual(rendered);
    });
});

describe("Twilio settings", () => {
    it("getTwilioSettings GETs /settings/twilio", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { tokenSet: false, configured: false }));

        expect(await getTwilioSettings()).toEqual({ tokenSet: false, configured: false });
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/twilio", expect.anything());
    });

    it("updateTwilioSettings PUTs the SID, token and sender to /settings/twilio", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { accountSid: "AC1", tokenSet: true, from: "+1", configured: true }));

        await updateTwilioSettings({ accountSid: "AC1", token: "secret", from: "+1" });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/twilio",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ accountSid: "AC1", token: "secret", from: "+1" }) }),
        );
    });
});

describe("resetting to config", () => {
    it("resetTwilioSettings POSTs to /settings/twilio/reset and returns the settings as they now are", async () => {
        const after = { accountSid: "AC1", tokenSet: true, from: "+1", configured: true };
        const fetchMock = mockFetch(() => jsonResponse(200, after));

        expect(await resetTwilioSettings()).toEqual(after);
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/twilio/reset", expect.objectContaining({ method: "POST" }));
    });

    it("resetSmtpSettings POSTs to /settings/smtp/reset and returns the settings as they now are", async () => {
        const after = { host: "smtp.acme.test", secure: false, passwordSet: true, configured: true };
        const fetchMock = mockFetch(() => jsonResponse(200, after));

        expect(await resetSmtpSettings()).toEqual(after);
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/smtp/reset", expect.objectContaining({ method: "POST" }));
    });
});

describe("SMTP settings", () => {
    it("getSmtpSettings GETs /settings/smtp", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { secure: false, passwordSet: false, configured: false }));

        expect(await getSmtpSettings()).toEqual({ secure: false, passwordSet: false, configured: false });
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/smtp", expect.anything());
    });

    it("updateSmtpSettings PUTs the changes to /settings/smtp, nulls included", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { host: "smtp.acme.test", secure: true, passwordSet: true, configured: true }));

        await updateSmtpSettings({ host: "smtp.acme.test", port: 465, secure: true, user: null, password: "secret", from: "a@b.c" });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/smtp",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ host: "smtp.acme.test", port: 465, secure: true, user: null, password: "secret", from: "a@b.c" }),
            }),
        );
    });
});
