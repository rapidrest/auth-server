// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../../../apps/shared/lib/passwordCriteria.js";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getPasswordRequirements: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, createUser: vi.fn(), createUserAlias: vi.fn(), createUserPasswordSecret: vi.fn() };
});

import { ApiRequestError, getPasswordRequirements } from "../../../../apps/shared/lib/api.js";
import { createUser, createUserAlias, createUserPasswordSecret } from "../../../../apps/shared/lib/adminApi.js";
import CreateUserForm from "../../../../apps/shared/components/admin/users/CreateUserForm.js";

const mockedGetPasswordRequirements = vi.mocked(getPasswordRequirements);
const mockedCreateUser = vi.mocked(createUser);
const mockedCreateUserAlias = vi.mocked(createUserAlias);
const mockedCreateUserPasswordSecret = vi.mocked(createUserPasswordSecret);

const VALID_PASSWORD = "Abcdef1!";

beforeEach(() => {
    mockedGetPasswordRequirements.mockResolvedValue(FALLBACK_PASSWORD_REQUIREMENTS);
    mockedCreateUser.mockReset();
    mockedCreateUserAlias.mockReset();
    mockedCreateUserPasswordSecret.mockReset();
});

async function fillIdentifier(user: ReturnType<typeof userEvent.setup>, value = "ada@example.com") {
    await user.type(screen.getByLabelText("Identifier"), value);
}

describe("CreateUserForm", () => {
    it("requires an identifier before submitting", async () => {
        const user = userEvent.setup();
        const onCreated = vi.fn();
        render(<CreateUserForm onCreated={onCreated} />);
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("An identifier (email, phone, or username) is required.")).toBeInTheDocument();
        expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it("rejects a weak password", async () => {
        const user = userEvent.setup();
        render(<CreateUserForm onCreated={vi.fn()} />);
        await fillIdentifier(user);
        await user.type(screen.getByLabelText("Temporary password (optional)"), "weak");
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("Password does not meet the requirements below.")).toBeInTheDocument();
        expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it("rejects mismatched passwords", async () => {
        const user = userEvent.setup();
        render(<CreateUserForm onCreated={vi.fn()} />);
        await fillIdentifier(user);
        await user.type(screen.getByLabelText("Temporary password (optional)"), VALID_PASSWORD);
        await user.type(screen.getByLabelText("Confirm temporary password"), "Different1!");
        await user.click(screen.getByRole("button", { name: "Create account" }));
        // "Passwords do not match." also appears inline under the confirm-password field (PasswordFieldset's
        // own live mismatch check) — assert on the top-level Alert specifically, not just the text.
        expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
        expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it("creates a bare account with an identifier when no password is entered", async () => {
        const user = userEvent.setup();
        const onCreated = vi.fn();
        mockedCreateUser.mockResolvedValue({ uid: "new-1", roles: [], scopes: [], verified: false, version: 0, dateCreated: "", dateModified: "" });
        mockedCreateUserAlias.mockResolvedValue({ uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "new-1", verified: false });

        render(<CreateUserForm onCreated={onCreated} />);
        await fillIdentifier(user);
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(mockedCreateUser).toHaveBeenCalledWith({ roles: [], scopes: [], verified: false, requireMFA: false });
        expect(mockedCreateUserAlias).toHaveBeenCalledWith("new-1", "email", "ada@example.com");
        expect(mockedCreateUserPasswordSecret).not.toHaveBeenCalled();
        expect(onCreated).toHaveBeenCalledWith("new-1");
    });

    it("also sets a password, roles, scopes, and verified when provided", async () => {
        const user = userEvent.setup();
        const onCreated = vi.fn();
        mockedCreateUser.mockResolvedValue({ uid: "new-2", roles: ["admin"], scopes: ["profile:contacts"], verified: true, version: 0, dateCreated: "", dateModified: "" });
        mockedCreateUserAlias.mockResolvedValue({ uid: "a1", version: 0, alias: "newadmin", type: "name", userUid: "new-2", verified: true });
        mockedCreateUserPasswordSecret.mockResolvedValue({ uid: "s1", version: 0, type: "password", userUid: "new-2", dateCreated: "" });

        render(<CreateUserForm onCreated={onCreated} />);
        await user.selectOptions(screen.getByLabelText("Identifier type"), "name");
        await fillIdentifier(user, "newadmin");
        await user.type(screen.getByLabelText("Temporary password (optional)"), VALID_PASSWORD);
        await user.type(screen.getByLabelText("Confirm temporary password"), VALID_PASSWORD);
        await user.type(screen.getByPlaceholderText("e.g. admin"), "admin{Enter}");
        await user.type(screen.getByPlaceholderText("e.g. profile:contacts"), "profile:contacts{Enter}");
        await user.click(screen.getByLabelText("Verified"));
        await user.click(screen.getByLabelText("Require multi-factor authentication to sign in"));
        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(mockedCreateUser).toHaveBeenCalledWith({
            roles: ["admin"],
            scopes: ["profile:contacts"],
            verified: true,
            requireMFA: true,
            passwordChangeRequired: true,
        });
        expect(mockedCreateUserAlias).toHaveBeenCalledWith("new-2", "name", "newadmin");
        // The password's owner can change it (a requirement to change it implies the right to).
        expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("new-2", VALID_PASSWORD, "Set by administrator", true);
        expect(onCreated).toHaveBeenCalledWith("new-2");
    });

    describe("generating a password", () => {
        const PASSWORD = "Temporary password (optional)";
        const CONFIRM = "Confirm temporary password";

        it("fills both fields with a password that meets the requirements, and shows it", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Generate" }));

            const password = (screen.getByLabelText(PASSWORD)).value;
            expect(password).toHaveLength(16);
            expect(screen.getByLabelText(PASSWORD)).toHaveAttribute("type", "text");
            expect(screen.getByLabelText(CONFIRM)).toHaveValue(password);
            expect(screen.getByLabelText(CONFIRM)).toHaveAttribute("type", "text");
            expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
        });

        it("creates the account with the generated password", async () => {
            const user = userEvent.setup();
            mockedCreateUser.mockResolvedValue({ uid: "new-4", roles: [], scopes: [], verified: false, version: 0, dateCreated: "", dateModified: "" });
            mockedCreateUserAlias.mockResolvedValue({ uid: "a1", version: 0, alias: "x", type: "email", userUid: "new-4", verified: false });
            mockedCreateUserPasswordSecret.mockResolvedValue({ uid: "s1", version: 0, type: "password", userUid: "new-4", dateCreated: "" });
            render(<CreateUserForm onCreated={vi.fn()} />);
            await fillIdentifier(user);
            await user.click(screen.getByRole("button", { name: "Generate" }));
            const generated = (screen.getByLabelText(PASSWORD)).value;
            await user.click(screen.getByRole("button", { name: "Create account" }));

            await waitFor(() => expect(mockedCreateUserPasswordSecret).toHaveBeenCalled());
            expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("new-4", generated, "Set by administrator", true);
        });

        it("makes a different password each time", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Generate" }));
            const first = (screen.getByLabelText(PASSWORD)).value;
            await user.click(screen.getByRole("button", { name: "Generate" }));
            expect((screen.getByLabelText(PASSWORD)).value).not.toBe(first);
        });

        it("can hide and show what it generated", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Generate" }));

            await user.click(screen.getByRole("button", { name: "Hide" }));
            expect(screen.getByLabelText(PASSWORD)).toHaveAttribute("type", "password");
            expect(screen.getByLabelText(CONFIRM)).toHaveAttribute("type", "password");

            await user.click(screen.getByRole("button", { name: "Show" }));
            expect(screen.getByLabelText(PASSWORD)).toHaveAttribute("type", "text");
        });

        it("copies it to the clipboard, and says so until it changes", async () => {
            const user = userEvent.setup();
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
            render(<CreateUserForm onCreated={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Generate" }));
            const generated = (screen.getByLabelText(PASSWORD)).value;

            await user.click(screen.getByRole("button", { name: "Copy" }));

            expect(writeText).toHaveBeenCalledWith(generated);
            expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
            await user.type(screen.getByLabelText(PASSWORD), "x");
            expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
        });

        it("doesn't fail when the clipboard is unavailable", async () => {
            const user = userEvent.setup();
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
            });
            render(<CreateUserForm onCreated={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Generate" }));

            await user.click(screen.getByRole("button", { name: "Copy" }));

            expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
        });
    });

    describe("password change options", () => {
        async function typePassword(user: ReturnType<typeof userEvent.setup>) {
            await user.type(screen.getByLabelText("Temporary password (optional)"), VALID_PASSWORD);
            await user.type(screen.getByLabelText("Confirm temporary password"), VALID_PASSWORD);
        }

        beforeEach(() => {
            mockedCreateUser.mockResolvedValue({ uid: "new-3", roles: [], scopes: [], verified: false, version: 0, dateCreated: "", dateModified: "" });
            mockedCreateUserAlias.mockResolvedValue({ uid: "a1", version: 0, alias: "x", type: "email", userUid: "new-3", verified: false });
            mockedCreateUserPasswordSecret.mockResolvedValue({ uid: "s1", version: 0, type: "password", userUid: "new-3", dateCreated: "" });
        });

        it("only offers them once a password has been entered", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            expect(screen.queryByLabelText("Allow the user to change their password")).not.toBeInTheDocument();
            expect(screen.queryByLabelText("Require the user to change their password at first sign-in")).not.toBeInTheDocument();

            await typePassword(user);

            expect(screen.getByLabelText("Allow the user to change their password")).toBeChecked();
            expect(screen.getByLabelText("Require the user to change their password at first sign-in")).toBeChecked();
        });

        it("keeps 'allow' checked and locked while a change is required", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            await typePassword(user);

            expect(screen.getByLabelText("Allow the user to change their password")).toBeDisabled();

            await user.click(screen.getByLabelText("Require the user to change their password at first sign-in"));

            expect(screen.getByLabelText("Allow the user to change their password")).toBeEnabled();
            expect(screen.getByLabelText("Allow the user to change their password")).toBeChecked();
        });

        it("lets an admin allow a change without requiring one", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            await fillIdentifier(user);
            await typePassword(user);
            await user.click(screen.getByLabelText("Require the user to change their password at first sign-in"));
            await user.click(screen.getByRole("button", { name: "Create account" }));

            await waitFor(() => expect(mockedCreateUserPasswordSecret).toHaveBeenCalled());
            expect(mockedCreateUser).toHaveBeenCalledWith({ roles: [], scopes: [], verified: false, requireMFA: false });
            expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("new-3", VALID_PASSWORD, "Set by administrator", true);
        });

        it("lets an admin set a password the account holder can neither change nor is asked to", async () => {
            const user = userEvent.setup();
            render(<CreateUserForm onCreated={vi.fn()} />);
            await fillIdentifier(user);
            await typePassword(user);
            await user.click(screen.getByLabelText("Require the user to change their password at first sign-in"));
            await user.click(screen.getByLabelText("Allow the user to change their password"));
            await user.click(screen.getByRole("button", { name: "Create account" }));

            await waitFor(() => expect(mockedCreateUserPasswordSecret).toHaveBeenCalled());
            expect(mockedCreateUser).toHaveBeenCalledWith({ roles: [], scopes: [], verified: false, requireMFA: false });
            expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("new-3", VALID_PASSWORD, "Set by administrator", false);
        });
    });

    it("shows the ApiRequestError message when account creation fails", async () => {
        const user = userEvent.setup();
        mockedCreateUser.mockRejectedValue(new ApiRequestError("uid taken", 409));
        render(<CreateUserForm onCreated={vi.fn()} />);
        await fillIdentifier(user);
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("uid taken")).toBeInTheDocument();
    });

    it("shows a generic message when account creation fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedCreateUser.mockRejectedValue(new Error("network down"));
        render(<CreateUserForm onCreated={vi.fn()} />);
        await fillIdentifier(user);
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("Could not create the account.")).toBeInTheDocument();
    });
});
