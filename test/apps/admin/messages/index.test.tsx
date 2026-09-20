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
    return { ...actual, listMessageTemplates: vi.fn(), getTwilioSettings: vi.fn(), getSmtpSettings: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../../apps/shared/lib/adminApi.js";
import { getSmtpSettings, getTwilioSettings, listMessageTemplates } from "../../../../apps/shared/lib/messagingApi.js";
import MessagesPage from "../../../../apps/admin/messages/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedEnsureElevated = vi.mocked(ensureElevated);
const mockedList = vi.mocked(listMessageTemplates);
const mockedGetTwilio = vi.mocked(getTwilioSettings);
const mockedGetSmtp = vi.mocked(getSmtpSettings);

const NO_TWILIO = { tokenSet: false, configured: false };
const NO_SMTP = { secure: false, passwordSet: false, configured: false };

const TEMPLATES = [
    { name: "login-otp", title: "Sign-in code", description: "Sent to sign someone in.", customized: false, enabled: true },
    { name: "register-otp", title: "Sign-up code", description: "Sent to confirm a contact.", customized: true, enabled: true },
];

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedEnsureElevated.mockReset();
    mockedList.mockReset();
    mockedGetTwilio.mockReset();
    mockedGetSmtp.mockReset();
    mockedGetCurrentUser.mockResolvedValue({ uid: "admin-1", version: 1, roles: ["admin"], scopes: [] });
    mockedEnsureElevated.mockResolvedValue(undefined);
});

describe("MessagesPage", () => {
    it("lists the messages and shows the e-mail and Twilio settings, under the Messages section", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetTwilio.mockResolvedValue(NO_TWILIO);
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(screen.getByText("Sign-up code")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (Twilio)")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        // The shell's top bar is the "Messages" heading; the page adds its own, different one.
        expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "E-mail & text messages" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page");
    });

    it("says it's loading until the messages arrive", async () => {
        mockedList.mockReturnValue(new Promise(() => undefined));
        mockedGetTwilio.mockReturnValue(new Promise(() => undefined));
        mockedGetSmtp.mockReturnValue(new Promise(() => undefined));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText(/Loading/)).toBeInTheDocument();
        expect(screen.queryByText("Text messages (Twilio)")).not.toBeInTheDocument();
        expect(screen.queryByText("E-mail (SMTP)")).not.toBeInTheDocument();
    });

    it("still shows the e-mail and Twilio settings when the messages fail to load, and says why", async () => {
        mockedList.mockRejectedValue(new ApiRequestError("Elevation required.", 403));
        mockedGetTwilio.mockResolvedValue(NO_TWILIO);
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Elevation required.")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (Twilio)")).toBeInTheDocument();
        expect(await screen.findByText("E-mail (SMTP)")).toBeInTheDocument();
        expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });

    it("still shows the messages when the Twilio settings fail to load, and says why", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetTwilio.mockRejectedValue(new ApiRequestError("database down", 500));
        mockedGetSmtp.mockResolvedValue(NO_SMTP);

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(await screen.findByText("database down")).toBeInTheDocument();
        expect(screen.queryByText("Text messages (Twilio)")).not.toBeInTheDocument();
    });

    it("still shows the messages and Twilio settings when the e-mail settings fail to load, and says why", async () => {
        mockedList.mockResolvedValue(TEMPLATES);
        mockedGetTwilio.mockResolvedValue(NO_TWILIO);
        mockedGetSmtp.mockRejectedValue(new ApiRequestError("smtp settings unreadable", 500));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("smtp settings unreadable")).toBeInTheDocument();
        expect(await screen.findByText("Sign-in code")).toBeInTheDocument();
        expect(await screen.findByText("Text messages (Twilio)")).toBeInTheDocument();
        expect(screen.queryByText("E-mail (SMTP)")).not.toBeInTheDocument();
    });

    it("shows a generic message for an unexpected failure on any of them", async () => {
        mockedList.mockRejectedValue(new Error("network down"));
        mockedGetTwilio.mockRejectedValue(new Error("network down"));
        mockedGetSmtp.mockRejectedValue(new Error("network down"));

        render(<MessagesPage userUid="admin-1" />);

        expect(await screen.findByText("Could not load the messages.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the text message settings.")).toBeInTheDocument();
        expect(await screen.findByText("Could not load the e-mail settings.")).toBeInTheDocument();
    });
});
