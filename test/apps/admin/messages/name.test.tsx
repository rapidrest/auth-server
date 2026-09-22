// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    return { ...actual, getMessageTemplate: vi.fn(), updateMessageTemplate: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../../apps/shared/lib/adminApi.js";
import { getMessageTemplate, MessageTemplateDetail, updateMessageTemplate } from "../../../../apps/shared/lib/messagingApi.js";
import MessagePage from "../../../../apps/admin/messages/[name].js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedEnsureElevated = vi.mocked(ensureElevated);
const mockedGet = vi.mocked(getMessageTemplate);
const mockedUpdate = vi.mocked(updateMessageTemplate);

const DETAIL: MessageTemplateDetail = {
    name: "login-otp",
    title: "Sign-in code",
    customized: false,
    enabled: true,
    subject: "Default subject",
    text: "Default text",
    html: "<p>Default</p>",
    sms: "Default sms",
    defaults: { enabled: true, subject: "Default subject", text: "Default text", html: "<p>Default</p>", sms: "Default sms" },
    overridden: {
        enabled: false,
        subject: false,
        text: false,
        html: false,
        sms: false,
        whatsapp: false,
        whatsappTemplateName: false,
        whatsappTemplateLanguage: false,
        whatsappTemplateParameters: false,
    },
    variables: [],
};

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedGetCurrentUser.mockResolvedValue({ uid: "admin-1", version: 1, roles: ["admin"], scopes: [] });
    mockedEnsureElevated.mockResolvedValue(undefined);
});

describe("MessagePage", () => {
    it("loads the message named in the URL and shows its editor, with a way back", async () => {
        mockedGet.mockResolvedValue(DETAIL);

        render(<MessagePage userUid="admin-1" params={{ name: "login-otp" }} />);

        expect(await screen.findByLabelText("Subject")).toHaveValue("Default subject");
        expect(mockedGet).toHaveBeenCalledWith("login-otp");
        expect(screen.getByRole("link", { name: /Back to messages/ })).toHaveAttribute("href", "/admin/messages");
        expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page");
    });

    it("says it's loading until the message arrives", async () => {
        mockedGet.mockReturnValue(new Promise(() => undefined));

        render(<MessagePage userUid="admin-1" params={{ name: "login-otp" }} />);

        expect(await screen.findByText(/Loading/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
    });

    it("shows why it couldn't load the message, and no editor", async () => {
        mockedGet.mockRejectedValue(new ApiRequestError("Not found", 404));

        render(<MessagePage userUid="admin-1" params={{ name: "nope" }} />);

        expect(await screen.findByText("Not found")).toBeInTheDocument();
        expect(screen.queryByLabelText("Subject")).not.toBeInTheDocument();
    });

    it("shows a generic message for an unexpected failure", async () => {
        mockedGet.mockRejectedValue(new Error("network down"));

        render(<MessagePage userUid="admin-1" params={{ name: "login-otp" }} />);

        expect(await screen.findByText("Could not load this message.")).toBeInTheDocument();
    });

    it("shows the message as the server has it after a save", async () => {
        const user = userEvent.setup();
        mockedGet.mockResolvedValue(DETAIL);
        mockedUpdate.mockResolvedValue({ ...DETAIL, customized: true, enabled: false });
        render(<MessagePage userUid="admin-1" params={{ name: "login-otp" }} />);
        await screen.findByLabelText("Subject");

        await user.click(screen.getByRole("switch", { name: /Send this message/ }));
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument());
        expect(screen.getByRole("switch", { name: /Send this message/ })).not.toBeChecked();
    });

    it("loads the new message when the name in the URL changes", async () => {
        mockedGet.mockResolvedValueOnce(DETAIL).mockResolvedValueOnce({ ...DETAIL, name: "register-otp", subject: "Register subject" });
        const { rerender } = render(<MessagePage userUid="admin-1" params={{ name: "login-otp" }} />);
        await screen.findByDisplayValue("Default subject");

        rerender(<MessagePage userUid="admin-1" params={{ name: "register-otp" }} />);

        expect(await screen.findByDisplayValue("Register subject")).toBeInTheDocument();
        expect(mockedGet).toHaveBeenLastCalledWith("register-otp");
    });
});
