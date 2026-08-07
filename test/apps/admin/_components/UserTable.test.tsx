// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import UserTable from "../../../../apps/shared/components/admin/users/UserTable.js";
import { AdminUser } from "../../../../apps/shared/lib/adminApi.js";

const baseUser: AdminUser = {
    uid: "u1",
    roles: ["admin"],
    scopes: ["profile:contacts"],
    verified: true,
    version: 0,
    dateCreated: "2024-01-15T00:00:00.000Z",
    dateModified: "2024-01-15T00:00:00.000Z",
};

describe("UserTable", () => {
    it("renders an empty state when there are no users", () => {
        render(<UserTable users={[]} onDelete={vi.fn()} />);
        expect(screen.getByText("No accounts found.")).toBeInTheDocument();
    });

    it("renders a row per user with roles, scopes, status, and a formatted date", () => {
        render(<UserTable users={[baseUser]} onDelete={vi.fn()} />);
        expect(screen.getByText("u1")).toBeInTheDocument();
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByText("profile:contacts")).toBeInTheDocument();
        expect(screen.getByText("Verified")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
            "href",
            "/admin/users/detail?uid=u1",
        );
    });

    it("renders a placeholder when a user has no roles or scopes", () => {
        render(<UserTable users={[{ ...baseUser, roles: [], scopes: [] }]} onDelete={vi.fn()} />);
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("tolerates a user record missing roles/scopes entirely (defensive fallback)", () => {
        const bareUser = { ...baseUser, roles: undefined, scopes: undefined } as unknown as AdminUser;
        render(<UserTable users={[bareUser]} onDelete={vi.fn()} />);
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("falls back to the raw ISO string if toLocaleDateString throws", () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
            throw new Error("boom");
        });
        render(<UserTable users={[baseUser]} onDelete={vi.fn()} />);
        expect(screen.getByText(baseUser.dateCreated)).toBeInTheDocument();
        spy.mockRestore();
    });

    it("renders an empty date cell when dateCreated is missing", () => {
        render(<UserTable users={[{ ...baseUser, dateCreated: "" }]} onDelete={vi.fn()} />);
        const row = screen.getByText("u1").closest("tr")!;
        expect(row.querySelectorAll("td")[4].textContent).toBe("");
    });

    it("calls onDelete with the user when Delete is clicked", async () => {
        const user = userEvent.setup();
        const onDelete = vi.fn();
        render(<UserTable users={[baseUser]} onDelete={onDelete} />);
        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onDelete).toHaveBeenCalledWith(baseUser);
    });
});
