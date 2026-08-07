// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DeleteUserModal from "../../../../apps/shared/components/admin/users/DeleteUserModal.js";
import { AdminUser } from "../../../../apps/shared/lib/adminApi.js";

const testUser: AdminUser = {
    uid: "u1",
    roles: [],
    scopes: [],
    verified: false,
    version: 0,
    dateCreated: "",
    dateModified: "",
};

describe("DeleteUserModal", () => {
    it("renders nothing when there is no target user", () => {
        render(<DeleteUserModal open={true} onClose={vi.fn()} user={null} onConfirm={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("confirms with purge=false by default", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<DeleteUserModal open={true} onClose={vi.fn()} user={testUser} onConfirm={onConfirm} />);
        expect(screen.getByText("u1")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onConfirm).toHaveBeenCalledWith(false);
    });

    it("confirms with purge=true when the checkbox is checked", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<DeleteUserModal open={true} onClose={vi.fn()} user={testUser} onConfirm={onConfirm} />);
        await user.click(screen.getByRole("checkbox"));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onConfirm).toHaveBeenCalledWith(true);
    });

    it("calls onClose when Cancel is clicked", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<DeleteUserModal open={true} onClose={onClose} user={testUser} onConfirm={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("shows an error message when given one", () => {
        render(<DeleteUserModal open={true} onClose={vi.fn()} user={testUser} onConfirm={vi.fn()} error="boom" />);
        expect(screen.getByText("boom")).toBeInTheDocument();
    });

    it("disables the buttons while deleting", () => {
        render(<DeleteUserModal open={true} onClose={vi.fn()} user={testUser} onConfirm={vi.fn()} deleting />);
        expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
});
