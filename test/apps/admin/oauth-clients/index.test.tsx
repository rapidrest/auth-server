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
    return { ...actual, listClients: vi.fn(), deleteClient: vi.fn(), ensureElevated: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { AdminClient, deleteClient, ensureElevated, listClients } from "../../../../apps/shared/lib/adminApi.js";
import OAuthClientsListPage from "../../../../apps/admin/oauth-clients/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedListClients = vi.mocked(listClients);
const mockedDeleteClient = vi.mocked(deleteClient);
const mockedEnsureElevated = vi.mocked(ensureElevated);

const adminSelf = { uid: "admin-1", version: 1, roles: ["admin"], scopes: [] };

function makeClient(uid: string): AdminClient {
    return {
        uid,
        version: 0,
        dateCreated: "",
        dateModified: "",
        clientId: `client-${uid}`,
        clientType: "confidential",
        clientName: `Client ${uid}`,
        redirectUris: [],
        grantTypes: [],
        responseTypes: [],
        scope: "",
        tokenEndpointAuthMethod: "client_secret_basic",
        requirePkce: false,
        firstParty: false,
    };
}

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedListClients.mockReset();
    mockedDeleteClient.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedEnsureElevated.mockResolvedValue(undefined);
});

describe("OAuthClientsListPage", () => {
    it("loads and renders the first page of clients", async () => {
        mockedListClients.mockResolvedValue([makeClient("c1")]);
        render(<OAuthClientsListPage userUid="admin-1" />);
        expect(await screen.findByRole("link", { name: "View" })).toHaveAttribute(
            "href",
            "/admin/oauth-clients/c1",
        );
        expect(mockedListClients).toHaveBeenCalledWith({ page: 0, limit: 25 });
        expect(screen.getByRole("link", { name: "+ New client" })).toHaveAttribute("href", "/admin/oauth-clients/new");
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("shows a load error", async () => {
        mockedListClients.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<OAuthClientsListPage userUid="admin-1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListClients.mockRejectedValue(new Error("network down"));
        render(<OAuthClientsListPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load clients.")).toBeInTheDocument();
    });

    it("enables Next when a full page is returned, and pages forward/backward", async () => {
        mockedListClients.mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeClient(`c${i}`)));
        const user = userEvent.setup();
        render(<OAuthClientsListPage userUid="admin-1" />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());

        await user.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() => expect(mockedListClients).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
        expect(screen.getByText("Page 2")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Previous" }));
        await waitFor(() => expect(mockedListClients).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
    });

    it("closes the delete modal without deleting when Cancel is clicked, then retries after a failed attempt and succeeds", async () => {
        mockedListClients.mockResolvedValue([makeClient("c1")]);
        const user = userEvent.setup();
        render(<OAuthClientsListPage userUid="admin-1" />);
        await screen.findByRole("link", { name: "View" });

        // Cancel — no deletion.
        await user.click(screen.getByRole("button", { name: "Delete" }));
        let dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(mockedDeleteClient).not.toHaveBeenCalled();

        // A failed attempt shows the error and keeps the modal open.
        mockedDeleteClient.mockRejectedValueOnce(new ApiRequestError("nope", 500));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(await within(dialog).findByText("nope")).toBeInTheDocument();

        // Retrying the same dialog after a successful call removes the client and closes it.
        mockedDeleteClient.mockResolvedValueOnce(undefined);
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(mockedDeleteClient).toHaveBeenLastCalledWith("c1", 0, false);
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("No clients found.")).toBeInTheDocument();
    });

    it("shows a generic message in the modal when deletion fails with a non-API error", async () => {
        mockedListClients.mockResolvedValue([makeClient("c1")]);
        mockedDeleteClient.mockRejectedValueOnce(new TypeError("boom"));
        const user = userEvent.setup();
        render(<OAuthClientsListPage userUid="admin-1" />);
        await screen.findByRole("link", { name: "View" });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await within(dialog).findByText("Could not delete this client.")).toBeInTheDocument();
    });
});
