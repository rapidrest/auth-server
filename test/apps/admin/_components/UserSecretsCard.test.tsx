// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../../../apps/shared/lib/passwordCriteria.js";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, deleteSecret: vi.fn(), getPasswordRequirements: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, listUserSecrets: vi.fn(), createUserPasswordSecret: vi.fn() };
});

import { ApiRequestError, deleteSecret, getPasswordRequirements } from "../../../../apps/shared/lib/api.js";
import { createUserPasswordSecret, listUserSecrets } from "../../../../apps/shared/lib/adminApi.js";
import UserSecretsCard from "../../../../apps/shared/components/admin/users/detail/UserSecretsCard.js";

const mockedListUserSecrets = vi.mocked(listUserSecrets);
const mockedCreateUserPasswordSecret = vi.mocked(createUserPasswordSecret);
const mockedDeleteSecret = vi.mocked(deleteSecret);
const mockedGetPasswordRequirements = vi.mocked(getPasswordRequirements);

const VALID_PASSWORD = "Abcdef1!";

beforeEach(() => {
    mockedListUserSecrets.mockReset();
    mockedCreateUserPasswordSecret.mockReset();
    mockedDeleteSecret.mockReset();
    mockedGetPasswordRequirements.mockReset();
    mockedGetPasswordRequirements.mockResolvedValue(FALLBACK_PASSWORD_REQUIREMENTS);
    window.confirm = vi.fn(() => true);
});

describe("UserSecretsCard", () => {
    it("shows a load error when listing secrets fails", async () => {
        mockedListUserSecrets.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<UserSecretsCard uid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListUserSecrets.mockRejectedValue(new Error("network down"));
        render(<UserSecretsCard uid="u1" />);
        expect(await screen.findByText("Could not load this account's sign-in methods.")).toBeInTheDocument();
    });

    it("shows an empty state with no sign-in methods", async () => {
        mockedListUserSecrets.mockResolvedValue([]);
        render(<UserSecretsCard uid="u1" />);
        expect(await screen.findByText("No sign-in methods registered.")).toBeInTheDocument();
    });

    it("renders a row per secret including its hint", async () => {
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "2024-01-15T00:00:00.000Z", hint: "Authy" },
        ]);
        render(<UserSecretsCard uid="u1" />);
        expect(await screen.findByText("Authenticator app")).toBeInTheDocument();
        expect(screen.getByText("(Authy)")).toBeInTheDocument();
    });

    it("falls back to the raw ISO string if toLocaleDateString throws", async () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
            throw new Error("boom");
        });
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "2024-01-15T00:00:00.000Z" },
        ]);
        render(<UserSecretsCard uid="u1" />);
        expect(await screen.findByText("2024-01-15T00:00:00.000Z")).toBeInTheDocument();
        spy.mockRestore();
    });

    it("does nothing to remove a secret when the confirmation is declined", async () => {
        window.confirm = vi.fn(() => false);
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "" },
        ]);
        const user = userEvent.setup();
        render(<UserSecretsCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(mockedDeleteSecret).not.toHaveBeenCalled();
    });

    it("removes a secret after confirmation", async () => {
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "" },
        ]);
        mockedDeleteSecret.mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(<UserSecretsCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(mockedDeleteSecret).toHaveBeenCalledWith("s1");
        await waitFor(() => expect(screen.getByText("No sign-in methods registered.")).toBeInTheDocument());
    });

    it("shows the ApiRequestError message when removal fails", async () => {
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "" },
        ]);
        mockedDeleteSecret.mockRejectedValue(new ApiRequestError("nope", 500));
        const user = userEvent.setup();
        render(<UserSecretsCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when removal fails with a non-API error", async () => {
        mockedListUserSecrets.mockResolvedValue([
            { uid: "s1", version: 0, type: "totp", userUid: "u1", dateCreated: "" },
        ]);
        mockedDeleteSecret.mockRejectedValue(new Error("network down"));
        const user = userEvent.setup();
        render(<UserSecretsCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that sign-in method.")).toBeInTheDocument();
    });

    describe("Set password modal", () => {
        it("rejects a weak password on a force-submit (the Save button is otherwise disabled)", async () => {
            mockedListUserSecrets.mockResolvedValue([]);
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("No sign-in methods registered.");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            await user.type(screen.getByLabelText("New password"), "weak");
            expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();

            const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
            fireEvent.submit(form);
            expect(await screen.findByText("Password does not meet the requirements below.")).toBeInTheDocument();
            expect(mockedCreateUserPasswordSecret).not.toHaveBeenCalled();
        });

        it("rejects mismatched passwords on a force-submit", async () => {
            mockedListUserSecrets.mockResolvedValue([]);
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("No sign-in methods registered.");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
            await user.type(screen.getByLabelText("Confirm new password"), "Different1!");
            expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();

            const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
            fireEvent.submit(form);
            expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
            expect(mockedCreateUserPasswordSecret).not.toHaveBeenCalled();
        });

        it("sets a password, removing any prior password secret", async () => {
            mockedListUserSecrets.mockResolvedValue([
                { uid: "old-pw", version: 0, type: "password", userUid: "u1", dateCreated: "" },
                { uid: "totp1", version: 0, type: "totp", userUid: "u1", dateCreated: "" },
            ]);
            mockedCreateUserPasswordSecret.mockResolvedValue({
                uid: "new-pw",
                version: 0,
                type: "password",
                userUid: "u1",
                dateCreated: "",
                hint: "Set by administrator",
            });
            mockedDeleteSecret.mockResolvedValue(undefined);
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("Authenticator app");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
            await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);
            await user.click(screen.getByRole("button", { name: "Save password" }));

            expect(mockedCreateUserPasswordSecret).toHaveBeenCalledWith("u1", VALID_PASSWORD, "Set by administrator");
            await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("old-pw"));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        });

        it("shows the ApiRequestError message when setting the password fails", async () => {
            mockedListUserSecrets.mockResolvedValue([]);
            mockedCreateUserPasswordSecret.mockRejectedValue(new ApiRequestError("nope", 400));
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("No sign-in methods registered.");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
            await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);
            await user.click(screen.getByRole("button", { name: "Save password" }));
            expect(await screen.findByText("nope")).toBeInTheDocument();
        });

        it("shows a generic message when setting the password fails with a non-API error", async () => {
            mockedListUserSecrets.mockResolvedValue([]);
            mockedCreateUserPasswordSecret.mockRejectedValue(new Error("network down"));
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("No sign-in methods registered.");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
            await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);
            await user.click(screen.getByRole("button", { name: "Save password" }));
            expect(await screen.findByText("Could not set this account's password.")).toBeInTheDocument();
        });

        it("closes via the modal's own close control", async () => {
            mockedListUserSecrets.mockResolvedValue([]);
            const user = userEvent.setup();
            render(<UserSecretsCard uid="u1" />);
            await screen.findByText("No sign-in methods registered.");
            await user.click(screen.getByRole("button", { name: "Set password" }));
            expect(screen.getByRole("dialog")).toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Close" }));
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });
});
