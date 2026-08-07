// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return {
        ...actual,
        getUser: vi.fn(),
        deleteUser: vi.fn(),
        getUserProfile: vi.fn(),
        listUserAliases: vi.fn(),
        listUserSecrets: vi.fn(),
    };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import {
    AdminUser,
    deleteUser,
    getUser,
    getUserProfile,
    listUserAliases,
    listUserSecrets,
} from "../../../../apps/shared/lib/adminApi.js";
import UserDetailPage from "../../../../apps/admin/users/detail/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedGetUser = vi.mocked(getUser);
const mockedDeleteUser = vi.mocked(deleteUser);
const mockedGetUserProfile = vi.mocked(getUserProfile);
const mockedListUserAliases = vi.mocked(listUserAliases);
const mockedListUserSecrets = vi.mocked(listUserSecrets);

const adminSelf = { uid: "admin-1", roles: ["admin"], scopes: [] };
const targetUser: AdminUser = {
    uid: "target-1",
    roles: ["editor"],
    scopes: [],
    verified: false,
    version: 4,
    dateCreated: "",
    dateModified: "",
};

/** Stubs `window.location` with a writable `href`/`replace` (like testUtils' `mockLocation`) plus a fixed `search`. */
function stubLocation(search: string): { href: string; replace: ReturnType<typeof vi.fn> } {
    const location = { href: "", replace: vi.fn(), search };
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: location });
    return location;
}

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedGetUser.mockReset();
    mockedDeleteUser.mockReset();
    mockedGetUserProfile.mockReset();
    mockedListUserAliases.mockReset();
    mockedListUserSecrets.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedGetUserProfile.mockResolvedValue(null);
    mockedListUserAliases.mockResolvedValue([]);
    mockedListUserSecrets.mockResolvedValue([]);
    window.confirm = vi.fn(() => true);
    stubLocation("?uid=target-1");
});

describe("UserDetailPage", () => {
    it("shows a message when no uid was specified", async () => {
        stubLocation("");
        render(<UserDetailPage userUid="admin-1" />);
        expect(await screen.findByText("No account specified.")).toBeInTheDocument();
        expect(mockedGetUser).not.toHaveBeenCalled();
    });

    it("loads and renders the target account's overview", async () => {
        mockedGetUser.mockResolvedValue(targetUser);
        render(<UserDetailPage userUid="admin-1" />);
        expect(await screen.findByText("target-1")).toBeInTheDocument();
        expect(mockedGetUser).toHaveBeenCalledWith("target-1");
    });

    it("shows an error when the account fails to load", async () => {
        mockedGetUser.mockRejectedValue(new ApiRequestError("not found", 404));
        render(<UserDetailPage userUid="admin-1" />);
        expect(await screen.findByText("not found")).toBeInTheDocument();
    });

    it("shows a generic error for a non-API load failure", async () => {
        mockedGetUser.mockRejectedValue(new Error("network down"));
        render(<UserDetailPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load this account.")).toBeInTheDocument();
    });

    it("deletes the account via the danger-zone modal and redirects to /admin", async () => {
        mockedGetUser.mockResolvedValue(targetUser);
        mockedDeleteUser.mockResolvedValue(undefined);
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<UserDetailPage userUid="admin-1" />);
        await screen.findByText("target-1");

        await user.click(screen.getByRole("button", { name: "Delete account" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(mockedDeleteUser).toHaveBeenCalledWith("target-1", 4, false);
        await waitFor(() => expect(location.href).toBe("/admin"));
    });

    it("shows an error in the modal when deletion fails, without redirecting", async () => {
        mockedGetUser.mockResolvedValue(targetUser);
        mockedDeleteUser.mockRejectedValue(new ApiRequestError("nope", 500));
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<UserDetailPage userUid="admin-1" />);
        await screen.findByText("target-1");

        await user.click(screen.getByRole("button", { name: "Delete account" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
        expect(location.href).toBe("");
    });

    it("shows a generic message in the modal when deletion fails with a non-API error", async () => {
        mockedGetUser.mockResolvedValue(targetUser);
        mockedDeleteUser.mockRejectedValue(new TypeError("boom"));
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<UserDetailPage userUid="admin-1" />);
        await screen.findByText("target-1");

        await user.click(screen.getByRole("button", { name: "Delete account" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("Could not delete this account.")).toBeInTheDocument();
        expect(location.href).toBe("");
    });

    it("closes the delete modal without deleting when Cancel is clicked", async () => {
        mockedGetUser.mockResolvedValue(targetUser);
        const user = userEvent.setup();
        render(<UserDetailPage userUid="admin-1" />);
        await screen.findByText("target-1");

        await user.click(screen.getByRole("button", { name: "Delete account" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(mockedDeleteUser).not.toHaveBeenCalled();
    });
});
