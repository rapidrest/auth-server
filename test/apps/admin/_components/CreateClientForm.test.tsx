// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, createClient: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { AdminClient, createClient } from "../../../../apps/shared/lib/adminApi.js";
import CreateClientForm from "../../../../apps/shared/components/admin/oauth-clients/CreateClientForm.js";

const mockedCreateClient = vi.mocked(createClient);

const createdClient: AdminClient = {
    uid: "c1",
    version: 0,
    dateCreated: "",
    dateModified: "",
    clientId: "client-abc",
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
};

beforeEach(() => {
    mockedCreateClient.mockReset();
});

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Client name"), "Test App");
    await user.type(screen.getByPlaceholderText("https://example.com/callback"), "https://example.com/callback{Enter}");
}

describe("CreateClientForm", () => {
    it("requires a client name before submitting", async () => {
        const user = userEvent.setup();
        render(<CreateClientForm onCreated={vi.fn()} />);
        await user.type(screen.getByPlaceholderText("https://example.com/callback"), "https://example.com/callback{Enter}");
        await user.click(screen.getByRole("button", { name: "Register client" }));
        expect(await screen.findByText("A client name is required.")).toBeInTheDocument();
        expect(mockedCreateClient).not.toHaveBeenCalled();
    });

    it("requires at least one redirect URI before submitting", async () => {
        const user = userEvent.setup();
        render(<CreateClientForm onCreated={vi.fn()} />);
        await user.type(screen.getByLabelText("Client name"), "Test App");
        await user.click(screen.getByRole("button", { name: "Register client" }));
        expect(await screen.findByText("At least one redirect URI is required.")).toBeInTheDocument();
        expect(mockedCreateClient).not.toHaveBeenCalled();
    });

    it("registers a confidential client with the default grant/response types and scope", async () => {
        const user = userEvent.setup();
        const onCreated = vi.fn();
        mockedCreateClient.mockResolvedValue(createdClient);

        render(<CreateClientForm onCreated={onCreated} />);
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(mockedCreateClient).toHaveBeenCalledWith({
            clientName: "Test App",
            clientType: "confidential",
            redirectUris: ["https://example.com/callback"],
            grantTypes: ["authorization_code"],
            responseTypes: ["code"],
            scope: "openid profile",
            tokenEndpointAuthMethod: "client_secret_basic",
            firstParty: false,
        });
        expect(onCreated).toHaveBeenCalledWith(createdClient);
    });

    it("forces tokenEndpointAuthMethod to none for a public client, regardless of the (hidden) select", async () => {
        const user = userEvent.setup();
        mockedCreateClient.mockResolvedValue({ ...createdClient, clientType: "public", clientSecret: undefined });

        render(<CreateClientForm onCreated={vi.fn()} />);
        await user.selectOptions(screen.getByLabelText("Client type"), "public");
        // The auth-method select is only rendered for a confidential client.
        expect(screen.queryByLabelText("Token endpoint auth method")).not.toBeInTheDocument();
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));

        expect(mockedCreateClient).toHaveBeenCalledWith(expect.objectContaining({ clientType: "public", tokenEndpointAuthMethod: "none" }));
    });

    it("honors an explicitly selected token endpoint auth method", async () => {
        const user = userEvent.setup();
        mockedCreateClient.mockResolvedValue(createdClient);

        render(<CreateClientForm onCreated={vi.fn()} />);
        await user.selectOptions(screen.getByLabelText("Token endpoint auth method"), "client_secret_post");
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));

        expect(mockedCreateClient).toHaveBeenCalledWith(expect.objectContaining({ tokenEndpointAuthMethod: "client_secret_post" }));
    });

    it("sets firstParty when the checkbox is checked", async () => {
        const user = userEvent.setup();
        mockedCreateClient.mockResolvedValue(createdClient);

        render(<CreateClientForm onCreated={vi.fn()} />);
        await fillRequiredFields(user);
        await user.click(screen.getByLabelText("First-party (skip the consent screen)"));
        await user.click(screen.getByRole("button", { name: "Register client" }));

        expect(mockedCreateClient).toHaveBeenCalledWith(expect.objectContaining({ firstParty: true }));
    });

    it("shows the ApiRequestError message when registration fails", async () => {
        const user = userEvent.setup();
        mockedCreateClient.mockRejectedValue(new ApiRequestError("client_id taken", 409));
        render(<CreateClientForm onCreated={vi.fn()} />);
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));
        expect(await screen.findByText("client_id taken")).toBeInTheDocument();
    });

    it("shows a generic message when registration fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedCreateClient.mockRejectedValue(new Error("network down"));
        render(<CreateClientForm onCreated={vi.fn()} />);
        await fillRequiredFields(user);
        await user.click(screen.getByRole("button", { name: "Register client" }));
        expect(await screen.findByText("Could not register this client.")).toBeInTheDocument();
    });
});
