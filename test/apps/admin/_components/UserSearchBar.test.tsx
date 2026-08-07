// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import UserSearchBar from "../../../../apps/shared/components/admin/users/UserSearchBar.js";

describe("UserSearchBar", () => {
    it("submits the default filters unchanged", async () => {
        const user = userEvent.setup();
        const onSearch = vi.fn();
        render(<UserSearchBar onSearch={onSearch} />);
        await user.click(screen.getByRole("button", { name: "Search" }));
        expect(onSearch).toHaveBeenCalledWith({ query: "", role: "", verified: "any" });
    });

    it("submits the entered query, role, and verified filter", async () => {
        const user = userEvent.setup();
        const onSearch = vi.fn();
        render(<UserSearchBar onSearch={onSearch} />);
        await user.type(screen.getByLabelText("Search"), "ada");
        await user.type(screen.getByLabelText("Role"), "admin");
        await user.selectOptions(screen.getByLabelText("Status"), "true");
        await user.click(screen.getByRole("button", { name: "Search" }));
        expect(onSearch).toHaveBeenCalledWith({ query: "ada", role: "admin", verified: "true" });
    });

    it("disables the Search button while searching", () => {
        render(<UserSearchBar onSearch={vi.fn()} searching />);
        expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    });
});
