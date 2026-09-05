// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DeleteClientModal from "../../../../apps/shared/components/admin/oauth-clients/DeleteClientModal.js";
import { AdminClient } from "../../../../apps/shared/lib/adminApi.js";

const testClient: AdminClient = {
    uid: "c1",
    version: 0,
    dateCreated: "",
    dateModified: "",
    clientId: "client-abc",
    clientType: "confidential",
    clientName: "Test App",
    redirectUris: [],
    grantTypes: [],
    responseTypes: [],
    scope: "",
    tokenEndpointAuthMethod: "client_secret_basic",
    requirePkce: false,
    firstParty: false,
};

describe("DeleteClientModal", () => {
    it("renders nothing when there is no target client", () => {
        render(<DeleteClientModal open={true} onClose={vi.fn()} client={null} onConfirm={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("confirms with purge=false by default", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<DeleteClientModal open={true} onClose={vi.fn()} client={testClient} onConfirm={onConfirm} />);
        expect(screen.getByText("Test App")).toBeInTheDocument();
        expect(screen.getByText("client-abc")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onConfirm).toHaveBeenCalledWith(false);
    });

    it("confirms with purge=true when the checkbox is checked", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<DeleteClientModal open={true} onClose={vi.fn()} client={testClient} onConfirm={onConfirm} />);
        await user.click(screen.getByRole("checkbox"));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onConfirm).toHaveBeenCalledWith(true);
    });

    it("calls onClose when Cancel is clicked", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<DeleteClientModal open={true} onClose={onClose} client={testClient} onConfirm={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("shows an error message when given one", () => {
        render(<DeleteClientModal open={true} onClose={vi.fn()} client={testClient} onConfirm={vi.fn()} error="boom" />);
        expect(screen.getByText("boom")).toBeInTheDocument();
    });

    it("disables the buttons while deleting", () => {
        render(<DeleteClientModal open={true} onClose={vi.fn()} client={testClient} onConfirm={vi.fn()} deleting />);
        expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
});
