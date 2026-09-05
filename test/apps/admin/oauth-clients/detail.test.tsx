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
    return { ...actual, getClient: vi.fn(), deleteClient: vi.fn(), ensureElevated: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { AdminClient, deleteClient, ensureElevated, getClient } from "../../../../apps/shared/lib/adminApi.js";
import OAuthClientDetailPage from "../../../../apps/admin/oauth-clients/detail/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedGetClient = vi.mocked(getClient);
const mockedDeleteClient = vi.mocked(deleteClient);
const mockedEnsureElevated = vi.mocked(ensureElevated);

const adminSelf = { uid: "admin-1", version: 1, roles: ["admin"], scopes: [] };
const targetClient: AdminClient = {
    uid: "target-1",
    version: 4,
    dateCreated: "",
    dateModified: "",
    clientId: "client-target-1",
    clientType: "confidential",
    clientName: "Target App",
    redirectUris: ["https://example.com/callback"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    scope: "openid",
    tokenEndpointAuthMethod: "client_secret_basic",
    requirePkce: false,
    firstParty: false,
};

/** Stubs `window.location` with a writable `href`/`replace` (like testUtils' `mockLocation`) plus a fixed `search`. */
function stubLocation(search: string): { href: string; replace: ReturnType<typeof vi.fn> } {
    const location = { href: "", replace: vi.fn(), search };
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: location });
    return location;
}

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedGetClient.mockReset();
    mockedDeleteClient.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedEnsureElevated.mockResolvedValue(undefined);
    stubLocation("?uid=target-1");
});

describe("OAuthClientDetailPage", () => {
    it("shows a message when no uid was specified", async () => {
        stubLocation("");
        render(<OAuthClientDetailPage userUid="admin-1" />);
        expect(await screen.findByText("No client specified.")).toBeInTheDocument();
        expect(mockedGetClient).not.toHaveBeenCalled();
    });

    it("loads and renders the target client's overview", async () => {
        mockedGetClient.mockResolvedValue(targetClient);
        render(<OAuthClientDetailPage userUid="admin-1" />);
        expect(await screen.findByText("client-target-1")).toBeInTheDocument();
        expect(mockedGetClient).toHaveBeenCalledWith("target-1");
    });

    it("shows an error when the client fails to load", async () => {
        mockedGetClient.mockRejectedValue(new ApiRequestError("not found", 404));
        render(<OAuthClientDetailPage userUid="admin-1" />);
        expect(await screen.findByText("not found")).toBeInTheDocument();
    });

    it("shows a generic error for a non-API load failure", async () => {
        mockedGetClient.mockRejectedValue(new Error("network down"));
        render(<OAuthClientDetailPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load this client.")).toBeInTheDocument();
    });

    it("deletes the client via the danger-zone modal and redirects to the list", async () => {
        mockedGetClient.mockResolvedValue(targetClient);
        mockedDeleteClient.mockResolvedValue(undefined);
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<OAuthClientDetailPage userUid="admin-1" />);
        await screen.findByText("client-target-1");

        await user.click(screen.getByRole("button", { name: "Delete client" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(mockedDeleteClient).toHaveBeenCalledWith("target-1", 4, false);
        await waitFor(() => expect(location.href).toBe("/admin/oauth-clients"));
    });

    it("shows an error in the modal when deletion fails, without redirecting", async () => {
        mockedGetClient.mockResolvedValue(targetClient);
        mockedDeleteClient.mockRejectedValue(new ApiRequestError("nope", 500));
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<OAuthClientDetailPage userUid="admin-1" />);
        await screen.findByText("client-target-1");

        await user.click(screen.getByRole("button", { name: "Delete client" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
        expect(location.href).toBe("");
    });

    it("shows a generic message in the modal when deletion fails with a non-API error", async () => {
        mockedGetClient.mockResolvedValue(targetClient);
        mockedDeleteClient.mockRejectedValue(new TypeError("boom"));
        const location = stubLocation("?uid=target-1");
        const user = userEvent.setup();
        render(<OAuthClientDetailPage userUid="admin-1" />);
        await screen.findByText("client-target-1");

        await user.click(screen.getByRole("button", { name: "Delete client" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("Could not delete this client.")).toBeInTheDocument();
        expect(location.href).toBe("");
    });

    it("closes the delete modal without deleting when Cancel is clicked", async () => {
        mockedGetClient.mockResolvedValue(targetClient);
        const user = userEvent.setup();
        render(<OAuthClientDetailPage userUid="admin-1" />);
        await screen.findByText("client-target-1");

        await user.click(screen.getByRole("button", { name: "Delete client" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(mockedDeleteClient).not.toHaveBeenCalled();
    });
});
