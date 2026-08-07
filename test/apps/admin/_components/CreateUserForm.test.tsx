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
        expect(mockedCreateUser).toHaveBeenCalledWith({ roles: [], scopes: [], verified: false });
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
        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(mockedCreateUser).toHaveBeenCalledWith({ roles: ["admin"], scopes: ["profile:contacts"], verified: true });
        expect(mockedCreateUserAlias).toHaveBeenCalledWith("new-2", "name", "newadmin");
        expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("new-2", VALID_PASSWORD, "Set by administrator");
        expect(onCreated).toHaveBeenCalledWith("new-2");
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
