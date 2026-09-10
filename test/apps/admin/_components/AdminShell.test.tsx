// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch, mockLocation } from "../../testUtils.js";
import AdminShell from "../../../../apps/shared/components/admin/layout/AdminShell.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AdminShell", () => {
    it("attempts a silent refresh when there is no userUid, redirecting to /auth/signin when it fails", async () => {
        const location = mockLocation();
        mockFetch(() => jsonResponse(401, { message: "no session" }));
        render(<AdminShell>content</AdminShell>);
        await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/auth/signin"));
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("reloads the page when a silent refresh succeeds with no userUid", async () => {
        const location = mockLocation();
        mockFetch(() => jsonResponse(200, { token: "tok", user: { uid: "u1", roles: [], scopes: [] } }));
        render(<AdminShell>content</AdminShell>);
        await waitFor(() => expect(location.reload).toHaveBeenCalled());
        expect(location.replace).not.toHaveBeenCalled();
    });

    it("shows an access-denied message when ensureElevated() rejects with api-103 (AUTH_REQUIRES_TRUSTED_ROLE) — a hard denial, not something re-elevating can fix", async () => {
        mockFetch((url) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "u1", roles: ["user"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(403, { code: "api-103", message: "User does not have permission to perform this action." });
            }
            throw new Error(`unexpected ${url}`);
        });
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("You do not have administrator access.")).toBeInTheDocument();
        expect(screen.queryByText("content")).not.toBeInTheDocument();
    });

    it("shows an error message when the authorization check fails for a reason other than api-103", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error message when the authorization check fails with a non-API error", async () => {
        mockFetch(() => {
            throw new TypeError("network down");
        });
        render(<AdminShell userUid="u1">content</AdminShell>);
        expect(await screen.findByText("Could not verify administrator access.")).toBeInTheDocument();
    });

    it("renders the nav chrome and children once elevated and authorized, and signs out", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                // Stands in for the authorization check (ensureElevated()) — already elevated and
                // authorized, so this succeeds on the first attempt without ElevationHost prompting.
                return jsonResponse(200, {});
            }
            if (url === "/api/auth/logout") {
                return emptyResponse(200);
            }
            if (url === "/api/settings") {
                return jsonResponse(200, { logoUploaded: false, stylesheetUploaded: false });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByText("admin-1")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin");
        expect(screen.getByRole("link", { name: "OAuth Clients" })).toHaveAttribute("href", "/admin/oauth-clients");
        expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/settings");
        expect(screen.getByText("RapidREST Admin")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(location.href).toBe("/auth/signin");
    });

    it("renders custom branding, header, and footer once site settings resolve", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/settings") {
                return jsonResponse(200, {
                    companyName: "Acme Inc",
                    logoUploaded: true,
                    headerHtml: "<p>Scheduled maintenance tonight</p>",
                    footerHtml: "<p>&copy; Acme Inc</p>",
                    stylesheetUploaded: false,
                });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("Acme Inc Admin")).toBeInTheDocument();
        expect(screen.getByText("Scheduled maintenance tonight")).toBeInTheDocument();
        expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "© Acme Inc")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Acme Inc Admin" }).querySelector("img")).toHaveAttribute(
            "src",
            "/api/settings/logo",
        );
    });

    it("prefers a configured icon over the logo for the nav mark", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/settings") {
                return jsonResponse(200, { logoUploaded: true, iconUploaded: true, stylesheetUploaded: false });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "RapidREST Admin" }).querySelector("img")).toHaveAttribute(
            "src",
            "/api/settings/icon",
        );
    });

    it("renders branding from an SSR-provided settings prop, without ever needing its own /api/settings fetch to resolve", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/settings") {
                // Never resolves — proves the nav brand below came from the `settings` prop's initial
                // value (see useSiteSettings()'s seeding), not this background refresh fetch.
                return new Promise(() => undefined);
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        render(
            <AdminShell userUid="admin-1" settings={{ companyName: "Acme Inc", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                content
            </AdminShell>,
        );

        expect(await screen.findByText("Acme Inc Admin")).toBeInTheDocument();
    });

    it("does not render admin content until the elevation prompt (triggered by ensureElevated()'s api-104) is satisfied", async () => {
        let elevated = false;
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return elevated
                    ? jsonResponse(200, {})
                    : jsonResponse(403, { code: "api-104", message: "This operation requires elevation." });
            }
            if (url === "/api/auth/elevation" && (init?.method ?? "GET") === "GET") {
                // No secondary methods enrolled -> ElevationHost falls back to the password step.
                return jsonResponse(200, []);
            }
            if (url === "/api/auth/elevation" && init?.method === "POST") {
                elevated = true;
                return jsonResponse(200, { token: "elevated-tok", refresh: "r", user: { uid: "admin-1", roles: ["admin"], scopes: [] } });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const user = userEvent.setup();
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        const dialog = await screen.findByRole("dialog");
        expect(screen.queryByText("content")).not.toBeInTheDocument();

        await user.type(within(dialog).getByLabelText("Password"), "correct-password");
        await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

        expect(await screen.findByText("content")).toBeInTheDocument();
    });
});
