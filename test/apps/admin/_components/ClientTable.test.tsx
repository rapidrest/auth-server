// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ClientTable from "../../../../apps/shared/components/admin/oauth-clients/ClientTable.js";
import { AdminClient } from "../../../../apps/shared/lib/adminApi.js";

const baseClient: AdminClient = {
    uid: "c1",
    version: 0,
    dateCreated: "2024-01-15T00:00:00.000Z",
    dateModified: "2024-01-15T00:00:00.000Z",
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
};

describe("ClientTable", () => {
    it("renders an empty state when there are no clients", () => {
        render(<ClientTable clients={[]} onDelete={vi.fn()} />);
        expect(screen.getByText("No clients found.")).toBeInTheDocument();
    });

    it("renders a row per client with name, id, type, scope, status, and a formatted date", () => {
        render(<ClientTable clients={[baseClient]} onDelete={vi.fn()} />);
        expect(screen.getByText("Test App")).toBeInTheDocument();
        expect(screen.getByText("client-abc")).toBeInTheDocument();
        expect(screen.getByText("Confidential")).toBeInTheDocument();
        expect(screen.getByText("openid")).toBeInTheDocument();
        expect(screen.getByText("profile")).toBeInTheDocument();
        expect(screen.getByText("Enabled")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
            "href",
            "/admin/oauth-clients/detail?uid=c1",
        );
    });

    it("renders Public for a public client and no first-party badge", () => {
        render(<ClientTable clients={[{ ...baseClient, clientType: "public" }]} onDelete={vi.fn()} />);
        expect(screen.getByText("Public")).toBeInTheDocument();
        expect(screen.queryByText("First-party")).not.toBeInTheDocument();
    });

    it("renders a first-party badge when the client is first-party", () => {
        render(<ClientTable clients={[{ ...baseClient, firstParty: true }]} onDelete={vi.fn()} />);
        expect(screen.getByText("First-party")).toBeInTheDocument();
    });

    it("renders Disabled status for a disabled client", () => {
        render(<ClientTable clients={[{ ...baseClient, disabled: true }]} onDelete={vi.fn()} />);
        expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("renders a placeholder when scope is empty", () => {
        render(<ClientTable clients={[{ ...baseClient, scope: "" }]} onDelete={vi.fn()} />);
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("falls back to the raw ISO string if toLocaleDateString throws", () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
            throw new Error("boom");
        });
        render(<ClientTable clients={[baseClient]} onDelete={vi.fn()} />);
        expect(screen.getByText(baseClient.dateCreated)).toBeInTheDocument();
        spy.mockRestore();
    });

    it("renders an empty date cell when dateCreated is missing", () => {
        render(<ClientTable clients={[{ ...baseClient, dateCreated: "" }]} onDelete={vi.fn()} />);
        const row = screen.getByRole("link", { name: "View" }).closest("tr")!;
        expect(row.querySelectorAll("td")[4].textContent).toBe("");
    });

    it("calls onDelete with the client when Delete is clicked", async () => {
        const user = userEvent.setup();
        const onDelete = vi.fn();
        render(<ClientTable clients={[baseClient]} onDelete={onDelete} />);
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onDelete).toHaveBeenCalledWith(baseClient);
    });
});
