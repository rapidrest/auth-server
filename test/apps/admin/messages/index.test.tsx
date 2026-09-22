// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, ensureElevated: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/messagingApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/messagingApi.js")>();
    return { ...actual, listMessageTemplates: vi.fn(), getSmsSettings: vi.fn(), getWhatsAppSettings: vi.fn(), getSmtpSettings: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../../apps/shared/lib/adminApi.js";
import { getSmsSettings, getSmtpSettings, getWhatsAppSettings, listMessageTemplates } from "../../../../apps/shared/lib/messagingApi.js";
import MessagesPage from "../../../../apps/admin/messages/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedEnsureElevated = vi.mocked(ensureElevated);
const mockedList = vi.mocked(listMessageTemplates);
const mockedGetSms = vi.mocked(getSmsSettings);
const mockedGetWhatsApp = vi.mocked(getWhatsAppSettings);
const mockedGetSmtp = vi.mocked(getSmtpSettings);

const NO_SMS = { twilio: { tokenSet: false }, telnyx: { apiKeySet: false }, configured: false };
const NO_WHATSAPP = { accessTokenSet: false, configured: false };
const NO_SMTP = { secure: false, passwordSet: false, configured: false };

const TEMPLATES = [
    { name: "login-otp", title: "Sign-in code", description: "Sent to sign someone in.", customized: false, enabled: true },
    { name: "register-otp", title: "Sign-up code", description: "Sent to confirm a contact.", customized: true, enabled: true },
];

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedEnsureElevated.mockReset();
    mockedList.mockReset();
    mockedGetSms.mockReset();
    mockedGetWhatsApp.mockReset();
    mockedGetSmtp.mockReset();
    mockedGetCurrentUser.mockResolvedValue({ uid: "admin-1", version: 1, roles: ["admin"], scopes: [] });
    mockedEnsureElevated.mockResolvedValue(undefined);
});

describe("MessagesPage", () => {
    it("lists the messages and shows the e-mail, text message and WhatsApp settings, under the Messages section", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetSms.mockResolvedValue(NO_SMS);
        mockedGetWhatsApp.mockResolvedValue(NO_WHATSAPP);
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(screen.getByText("Sign-up code")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (SMS)")).toBeInTheDocument();
        expect(await screen.findByText("WhatsApp")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        // The shell's top bar is the "Messages" heading; the page adds its own, different one.
        expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "E-mail, text & WhatsApp messages" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page");
    });

    it("says it's loading until the messages arrive", async () => {
        mockedList.mockReturnValue(new Promise(() => undefined));
        mockedGetSms.mockReturnValue(new Promise(() => undefined));
        mockedGetWhatsApp.mockReturnValue(new Promise(() => undefined));
        mockedGetSmtp.mockReturnValue(new Promise(() => undefined));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText(/Loading/)).toBeInTheDocument();
        expect(screen.queryByText("Text messages (SMS)")).not.toBeInTheDocument();
        expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
        expect(screen.queryByText("E-mail (SMTP)")).not.toBeInTheDocument();
    });

    it("still shows the e-mail, text message and WhatsApp settings when the messages fail to load, and says why", async () => {
        mockedList.mockRejectedValue(new ApiRequestError("Elevation required.", 403));
        mockedGetSms.mockResolvedValue(NO_SMS);
        mockedGetWhatsApp.mockResolvedValue(NO_WHATSAPP);
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Elevation required.")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (SMS)")).toBeInTheDocument();
        expect(await screen.findByText("WhatsApp")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });

    it("still shows the messages and the other settings when the text message settings fail to load, and says why", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetSms.mockRejectedValue(new ApiRequestError("database down", 500));
        mockedGetWhatsApp.mockResolvedValue(NO_WHATSAPP);
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(await screen.findByText("database down")).toBeInTheDocument();
        expect(await screen.findByText("WhatsApp")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        expect(screen.queryByText("Text messages (SMS)")).not.toBeInTheDocument();
    });

    it("still shows the messages and the other settings when the WhatsApp settings fail to load, and says why", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetSms.mockResolvedValue(NO_SMS);
        mockedGetWhatsApp.mockRejectedValue(new ApiRequestError("whatsapp settings unreadable", 500));
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("whatsapp settings unreadable")).toBeInTheDocument();
        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (SMS)")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    });

    it("still shows the messages and the other settings when the e-mail settings fail to load, and says why", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetSms.mockResolvedValue(NO_SMS);
        mockedGetWhatsApp.mockResolvedValue(NO_WHATSAPP);
        mockedGetSmtp.mockRejectedValue(new ApiRequestError("smtp settings unreadable", 500));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("smtp settings unreadable")).toBeInTheDocument();
        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (SMS)")).toBeInTheDocument();
        expect(await screen.findByText("WhatsApp")).toBeInTheDocument();
        expect(screen.queryByText("E-mail (SMTP)")).not.toBeInTheDocument();
    });

    it("shows a generic message for an unexpected failure on any of them", async () => {
        mockedList.mockRejectedValue(new Error("network down"));
        mockedGetSms.mockRejectedValue(new Error("network down"));
        mockedGetWhatsApp.mockRejectedValue(new Error("network down"));
        mockedGetSmtp.mockRejectedValue(new Error("network down"));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Could not load the messages.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the text message settings.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the WhatsApp settings.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the e-mail settings.")).toBeInTheDocument();
    });
});
