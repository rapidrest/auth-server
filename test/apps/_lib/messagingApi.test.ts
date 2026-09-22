// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    getMessageTemplate,
    getSmsSettings,
    getSmtpSettings,
    getWhatsAppSettings,
    listMessageTemplates,
    previewMessageTemplate,
    resetMessageTemplate,
    resetSmsSettings,
    resetSmtpSettings,
    resetWhatsAppSettings,
    updateMessageTemplate,
    updateSmsSettings,
    updateSmtpSettings,
    updateWhatsAppSettings,
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
        const rendered = { subject: "S", text: "T", html: null, sms: null, whatsapp: 'Template "login_code" (en_US)\n{{1}}: 123456' };
        const fetchMock = mockFetch(() => jsonResponse(200, rendered));

        const result = await previewMessageTemplate("login-otp", { sms: "Draft" });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/messages/login-otp/preview",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ sms: "Draft" }) }),
        );
        expect(result).toEqual(rendered);
    });
});

describe("SMS settings", () => {
    const NONE = { twilio: { tokenSet: false }, telnyx: { apiKeySet: false }, configured: false };

    it("getSmsSettings GETs /settings/sms", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, NONE));

        expect(await getSmsSettings()).toEqual(NONE);
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/sms", expect.anything());
    });

    it("updateSmsSettings PUTs the provider, its settings and the sender to /settings/sms", async () => {
        const input = { provider: "twilio" as const, twilio: { accountSid: "AC1", token: "secret" }, from: "+1" };
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { provider: "twilio", twilio: { accountSid: "AC1", tokenSet: true }, telnyx: { apiKeySet: false }, from: "+1", configured: true }),
        );

        await updateSmsSettings(input);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/sms",
            expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
        );
    });

    it("updateSmsSettings PUTs a switch to Telnyx, nulls included", async () => {
        const input = { provider: "telnyx" as const, telnyx: { apiKey: "KEY", messagingProfileId: null }, from: null };
        const fetchMock = mockFetch(() => jsonResponse(200, NONE));

        await updateSmsSettings(input);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/sms",
            expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
        );
    });
});

describe("WhatsApp settings", () => {
    it("getWhatsAppSettings GETs /settings/whatsapp", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { accessTokenSet: false, configured: false }));

        expect(await getWhatsAppSettings()).toEqual({ accessTokenSet: false, configured: false });
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/whatsapp", expect.anything());
    });

    it("updateWhatsAppSettings PUTs the phone number ID, token and version to /settings/whatsapp, nulls included", async () => {
        const fetchMock = mockFetch(() =>
            jsonResponse(200, { phoneNumberId: "1234567890", accessTokenSet: true, apiVersion: "v23.0", configured: true }),
        );

        await updateWhatsAppSettings({ phoneNumberId: "1234567890", accessToken: "secret", apiVersion: null });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings/whatsapp",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ phoneNumberId: "1234567890", accessToken: "secret", apiVersion: null }),
            }),
        );
    });
});

describe("resetting to config", () => {
    it("resetSmsSettings POSTs to /settings/sms/reset and returns the settings as they now are", async () => {
        const after = { provider: "telnyx", twilio: { tokenSet: false }, telnyx: { apiKeySet: true }, from: "+1", configured: true };
        const fetchMock = mockFetch(() => jsonResponse(200, after));

        expect(await resetSmsSettings()).toEqual(after);
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/sms/reset", expect.objectContaining({ method: "POST" }));
    });

    it("resetWhatsAppSettings POSTs to /settings/whatsapp/reset and returns the settings as they now are", async () => {
        const after = { phoneNumberId: "1234567890", accessTokenSet: true, configured: true };
        const fetchMock = mockFetch(() => jsonResponse(200, after));

        expect(await resetWhatsAppSettings()).toEqual(after);
        expect(fetchMock).toHaveBeenCalledWith("/api/settings/whatsapp/reset", expect.objectContaining({ method: "POST" }));
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
