// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, listUsers: vi.fn(), searchUsers: vi.fn(), deleteUser: vi.fn(), listAliasesForUsers: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../apps/shared/lib/api.js";
import { AdminUser, deleteUser, listAliasesForUsers, listUsers, searchUsers } from "../../../apps/shared/lib/adminApi.js";
import UsersListPage from "../../../apps/admin/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedListUsers = vi.mocked(listUsers);
const mockedSearchUsers = vi.mocked(searchUsers);
const mockedDeleteUser = vi.mocked(deleteUser);
const mockedListAliasesForUsers = vi.mocked(listAliasesForUsers);

const adminSelf = { uid: "admin-1", roles: ["admin"], scopes: [] };

function makeUser(uid: string): AdminUser {
    return { uid, roles: [], scopes: [], verified: false, version: 0, dateCreated: "", dateModified: "" };
}

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedListUsers.mockReset();
    mockedSearchUsers.mockReset();
    mockedDeleteUser.mockReset();
    mockedListAliasesForUsers.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedListAliasesForUsers.mockResolvedValue([]);
    window.confirm = vi.fn(() => true);
});

describe("UsersListPage", () => {
    it("loads and renders the first page of users", async () => {
        mockedListUsers.mockResolvedValue([makeUser("u1")]);
        render(<UsersListPage userUid="admin-1" />);
        expect(await screen.findByText("u1")).toBeInTheDocument();
        expect(mockedListUsers).toHaveBeenCalledWith({ page: 0, limit: 25, role: undefined, verified: undefined });
        expect(screen.getByRole("link", { name: "+ New user" })).toHaveAttribute("href", "/admin/users/new");
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("fetches and renders aliases for the loaded page of users", async () => {
        mockedListUsers.mockResolvedValue([makeUser("u1")]);
        mockedListAliasesForUsers.mockResolvedValue([
            { uid: "a1", version: 0, alias: "jane@example.com", type: "email", userUid: "u1", verified: true },
        ]);
        render(<UsersListPage userUid="admin-1" />);
        expect(await screen.findByText("jane@example.com")).toBeInTheDocument();
        expect(mockedListAliasesForUsers).toHaveBeenCalledWith(["u1"]);
    });

    it("shows a load error", async () => {
        mockedListUsers.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<UsersListPage userUid="admin-1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListUsers.mockRejectedValue(new Error("network down"));
        render(<UsersListPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load accounts.")).toBeInTheDocument();
    });

    it("enables Next when a full page is returned, and pages forward/backward", async () => {
        mockedListUsers.mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeUser(`u${i}`)));
        const user = userEvent.setup();
        render(<UsersListPage userUid="admin-1" />);
        await screen.findByText("u0");
        expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

        await user.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() => expect(mockedListUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
        expect(screen.getByText("Page 2")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Previous" }));
        await waitFor(() => expect(mockedListUsers).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
    });

    it("passes the role and verified filters through to listUsers", async () => {
        mockedListUsers.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<UsersListPage userUid="admin-1" />);
        await screen.findByText("No accounts found.");

        await user.type(screen.getByLabelText("Role"), "admin");
        await user.selectOptions(screen.getByLabelText("Status"), "Verified");
        await user.click(screen.getByRole("button", { name: "Search" }));

        await waitFor(() =>
            expect(mockedListUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: "admin", verified: true })),
        );

        await user.selectOptions(screen.getByLabelText("Status"), "Unverified");
        await user.click(screen.getByRole("button", { name: "Search" }));

        await waitFor(() => expect(mockedListUsers).toHaveBeenLastCalledWith(expect.objectContaining({ verified: false })));
    });

    it("switches to searchUsers and hides pagination while a query is active", async () => {
        mockedListUsers.mockResolvedValue([]);
        mockedSearchUsers.mockResolvedValue([makeUser("found-1")]);
        const user = userEvent.setup();
        render(<UsersListPage userUid="admin-1" />);
        await screen.findByText("No accounts found.");

        await user.type(screen.getByLabelText("Search"), "found");
        await user.click(screen.getByRole("button", { name: "Search" }));

        expect(await screen.findByText("found-1")).toBeInTheDocument();
        expect(mockedSearchUsers).toHaveBeenCalledWith("found", expect.objectContaining({ page: 0 }));
        expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    });

    it("closes the delete modal without deleting when Cancel is clicked, then retries after a failed attempt and succeeds", async () => {
        mockedListUsers.mockResolvedValue([makeUser("u1")]);
        const user = userEvent.setup();
        render(<UsersListPage userUid="admin-1" />);
        await screen.findByText("u1");

        // Cancel — no deletion.
        await user.click(screen.getByRole("button", { name: "Delete" }));
        let dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(mockedDeleteUser).not.toHaveBeenCalled();

        // A failed attempt shows the error and keeps the modal open.
        mockedDeleteUser.mockRejectedValueOnce(new ApiRequestError("nope", 500));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(await within(dialog).findByText("nope")).toBeInTheDocument();

        // Retrying the same dialog after a successful call removes the user and closes it.
        mockedDeleteUser.mockResolvedValueOnce(undefined);
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(mockedDeleteUser).toHaveBeenLastCalledWith("u1", 0, false);
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("No accounts found.")).toBeInTheDocument();
    });

    it("shows a generic message in the modal when deletion fails with a non-API error", async () => {
        mockedListUsers.mockResolvedValue([makeUser("u1")]);
        mockedDeleteUser.mockRejectedValueOnce(new TypeError("boom"));
        const user = userEvent.setup();
        render(<UsersListPage userUid="admin-1" />);
        await screen.findByText("u1");

        await user.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await within(dialog).findByText("Could not delete this account.")).toBeInTheDocument();
    });
});
