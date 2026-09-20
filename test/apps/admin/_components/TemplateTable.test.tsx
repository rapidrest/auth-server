// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TemplateTable, { templateHref } from "../../../../apps/shared/components/admin/messages/TemplateTable.js";
import { MessageTemplateSummary } from "../../../../apps/shared/lib/messagingApi.js";

const login: MessageTemplateSummary = {
    name: "login-otp",
    title: "Sign-in code",
    description: "Sent to sign someone in.",
    customized: false,
    enabled: true,
};

describe("templateHref", () => {
    it("points at the message's editor, encoding its name", () => {
        expect(templateHref("login-otp")).toBe("/admin/messages/login-otp");
        expect(templateHref("a/b c")).toBe("/admin/messages/a%2Fb%20c");
    });
});

describe("TemplateTable", () => {
    it("says so when there are no messages", () => {
        render(<TemplateTable templates={[]} />);

        expect(screen.getByText("No messages found.")).toBeInTheDocument();
    });

    it("lists each message by its title, with its description and a link to edit it", () => {
        render(<TemplateTable templates={[login]} />);

        const row = screen.getByText("Sign-in code").closest("tr")!;
        expect(within(row).getByText("Sent to sign someone in.")).toBeInTheDocument();
        expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/admin/messages/login-otp");
    });

    it("falls back to the message's name when it has no title, and shows no description line when it has none", () => {
        render(<TemplateTable templates={[{ name: "custom-thing", customized: false, enabled: true }]} />);

        const row = screen.getByText("custom-thing").closest("tr")!;
        expect(within(row).queryByText("Sent to sign someone in.")).not.toBeInTheDocument();
    });

    it("shows whether each message is the default or has been customized", () => {
        render(<TemplateTable templates={[login, { ...login, name: "register-otp", title: "Sign-up code", customized: true }]} />);

        expect(within(screen.getByText("Sign-in code").closest("tr")!).getByText("Default")).toBeInTheDocument();
        expect(within(screen.getByText("Sign-up code").closest("tr")!).getByText("Customized")).toBeInTheDocument();
    });

    it("marks a message that's switched off", () => {
        render(<TemplateTable templates={[login, { ...login, name: "register-otp", title: "Sign-up code", enabled: false }]} />);

        expect(within(screen.getByText("Sign-up code").closest("tr")!).getByText("Off")).toBeInTheDocument();
        expect(within(screen.getByText("Sign-in code").closest("tr")!).queryByText("Off")).not.toBeInTheDocument();
    });
});
