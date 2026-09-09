// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../../testUtils.js";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, createClient: vi.fn(), ensureElevated: vi.fn() };
});

import { getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { createClient, ensureElevated } from "../../../../apps/shared/lib/adminApi.js";
import NewOAuthClientPage from "../../../../apps/admin/oauth-clients/new.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedCreateClient = vi.mocked(createClient);
const mockedEnsureElevated = vi.mocked(ensureElevated);

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedCreateClient.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetCurrentUser.mockResolvedValue({ uid: "admin-1", version: 1, roles: ["admin"], scopes: [] });
    mockedEnsureElevated.mockResolvedValue(undefined);
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText("Client name"), "Test App");
    await user.type(screen.getByPlaceholderText("https://example.com/callback"), "https://example.com/callback{Enter}");
}

describe("NewOAuthClientPage", () => {
    it("renders the create-client form once authorized", async () => {
        render(<NewOAuthClientPage userUid="admin-1" />);
        expect(await screen.findByText("New OAuth client")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Register client" })).toBeInTheDocument();
    });

    it("redirects to the new client's detail page immediately for a public client (no secret to reveal)", async () => {
        mockedCreateClient.mockResolvedValue({
            uid: "new-1",
            version: 0,
            dateCreated: "",
            dateModified: "",
            clientId: "client-new-1",
            clientType: "public",
            clientName: "Test App",
            redirectUris: ["https://example.com/callback"],
            grantTypes: ["authorization_code"],
            responseTypes: ["code"],
            scope: "openid profile",
            tokenEndpointAuthMethod: "none",
            requirePkce: true,
            firstParty: false,
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<NewOAuthClientPage userUid="admin-1" />);
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));
        expect(location.href).toBe("/admin/oauth-clients/new-1");
    });

    it("reveals the plaintext secret for a confidential client, then redirects once dismissed", async () => {
        mockedCreateClient.mockResolvedValue({
            uid: "new-2",
            version: 0,
            dateCreated: "",
            dateModified: "",
            clientId: "client-new-2",
            clientType: "confidential",
            clientName: "Test App",
            redirectUris: ["https://example.com/callback"],
            grantTypes: ["authorization_code"],
            responseTypes: ["code"],
            scope: "openid profile",
            tokenEndpointAuthMethod: "client_secret_basic",
            requirePkce: false,
            firstParty: false,
            clientSecret: "plaintext-secret",
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<NewOAuthClientPage userUid="admin-1" />);
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));

        expect(await screen.findByText("plaintext-secret")).toBeInTheDocument();
        expect(location.href).toBe("");

        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(location.href).toBe("/admin/oauth-clients/new-2");
    });
});
