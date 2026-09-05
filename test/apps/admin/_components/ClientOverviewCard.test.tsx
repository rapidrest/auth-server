// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, updateClient: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { AdminClient, updateClient } from "../../../../apps/shared/lib/adminApi.js";
import ClientOverviewCard from "../../../../apps/shared/components/admin/oauth-clients/ClientOverviewCard.js";

const mockedUpdateClient = vi.mocked(updateClient);

const baseClient: AdminClient = {
    uid: "c1",
    version: 1,
    dateCreated: "2024-01-15T00:00:00.000Z",
    dateModified: "2024-01-16T00:00:00.000Z",
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
    disabled: false,
};

beforeEach(() => {
    mockedUpdateClient.mockReset();
});

describe("ClientOverviewCard", () => {
    it("renders the client's id, type, dates, name, and status", () => {
        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        expect(screen.getByText("client-abc")).toBeInTheDocument();
        expect(screen.getByText("Confidential")).toBeInTheDocument();
        expect(screen.getByLabelText("Client name")).toHaveValue("Test App");
        expect(screen.getByLabelText("First-party (skip the consent screen)")).not.toBeChecked();
        expect(screen.getByLabelText("Disabled (rejects every authorization/token request for this client)")).not.toBeChecked();
    });

    it("saves edits and reports the updated client", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseClient, clientName: "Renamed App", firstParty: true, version: 2 };
        mockedUpdateClient.mockResolvedValue(updated);

        render(<ClientOverviewCard client={baseClient} onUpdated={onUpdated} />);
        await user.clear(screen.getByLabelText("Client name"));
        await user.type(screen.getByLabelText("Client name"), "Renamed App");
        await user.click(screen.getByLabelText("First-party (skip the consent screen)"));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateClient).toHaveBeenCalledWith({
            uid: "c1",
            version: 1,
            clientName: "Renamed App",
            redirectUris: ["https://example.com/callback"],
            grantTypes: ["authorization_code"],
            responseTypes: ["code"],
            scope: "openid profile",
            firstParty: true,
            disabled: false,
        });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("saves disabled:true when the Disabled checkbox is checked", async () => {
        const user = userEvent.setup();
        mockedUpdateClient.mockResolvedValue({ ...baseClient, disabled: true, version: 2 });

        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        await user.click(screen.getByLabelText("Disabled (rejects every authorization/token request for this client)"));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateClient).toHaveBeenCalledWith(expect.objectContaining({ disabled: true }));
    });

    it("clears the 'Saved.' indicator once a field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateClient.mockResolvedValue(baseClient);
        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.click(screen.getByLabelText("First-party (skip the consent screen)"));
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateClient.mockRejectedValue(new ApiRequestError("stale version", 409));
        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("stale version")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateClient.mockRejectedValue(new Error("network down"));
        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save this client.")).toBeInTheDocument();
    });

    it("renders Public for a public client", () => {
        render(<ClientOverviewCard client={{ ...baseClient, clientType: "public" }} onUpdated={vi.fn()} />);
        expect(screen.getByText("Public")).toBeInTheDocument();
    });

    it("renders an empty date when dateCreated/dateModified are missing", () => {
        const client = { ...baseClient, dateCreated: "", dateModified: "" };
        const { container } = render(<ClientOverviewCard client={client} onUpdated={vi.fn()} />);
        const dds = container.querySelectorAll("dd");
        expect(dds[2]).toHaveTextContent("");
        expect(dds[3]).toHaveTextContent("");
    });

    it("falls back to the raw ISO string if toLocaleString throws", () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
            throw new Error("boom");
        });
        render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        expect(screen.getByText(baseClient.dateCreated)).toBeInTheDocument();
        spy.mockRestore();
    });

    it("treats a missing scope as an empty chip list", () => {
        render(<ClientOverviewCard client={{ ...baseClient, scope: "" }} onUpdated={vi.fn()} />);
        // The default `baseClient.scope` ("openid profile") would otherwise render those two chips —
        // their absence confirms the Scope field's RoleScopeEditor got an empty array, not the string "".
        expect(screen.queryByText("openid")).not.toBeInTheDocument();
        expect(screen.queryByText("profile")).not.toBeInTheDocument();
    });

    it("reseeds its fields when a different client is loaded", () => {
        const { rerender } = render(<ClientOverviewCard client={baseClient} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Client name")).toHaveValue("Test App");
        const otherClient: AdminClient = { ...baseClient, uid: "c2", clientName: "Other App", firstParty: true };
        rerender(<ClientOverviewCard client={otherClient} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Client name")).toHaveValue("Other App");
        expect(screen.getByLabelText("First-party (skip the consent screen)")).toBeChecked();
    });
});
