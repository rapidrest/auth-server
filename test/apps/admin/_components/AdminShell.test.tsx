// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch, mockLocation } from "../../testUtils.js";
import { setAuthToken } from "../../../../apps/shared/lib/api.js";
import AdminShell from "../../../../apps/shared/components/admin/layout/AdminShell.js";

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

describe("AdminShell", () => {
    it("redirects to /auth/signin and renders nothing when there is no userUid", () => {
        const location = mockLocation();
        render(<AdminShell>content</AdminShell>);
        expect(location.replace).toHaveBeenCalledWith("/auth/signin");
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an access-denied message when the current user lacks the admin role", async () => {
        mockFetch(() => jsonResponse(200, { uid: "u1", roles: ["user"], scopes: [] }));
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("You do not have administrator access.")).toBeInTheDocument();
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an error message when checking the current user fails", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when checking the current user fails with a non-API error", async () => {
        mockFetch(() => {
            throw new TypeError("network down");
        });
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("Could not verify administrator access.")).toBeInTheDocument();
    });

    it("renders the nav chrome and children once an admin is verified, and signs out", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/auth/logout") {
                return emptyResponse(200);
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        setAuthToken("tok");
        const location = mockLocation();
        const user = userEvent.setup();
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByText("admin-1")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin");

        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(location.href).toBe("/auth/signin");
    });
});
