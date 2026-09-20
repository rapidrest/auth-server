// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch, mockLocation } from "../../testUtils.js";
import AdminShell, { resolveDisplayName } from "../../../../apps/shared/components/admin/layout/AdminShell.js";

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

    it("renders the sidebar, top bar, and children once elevated and authorized, and signs out from the avatar menu", async () => {
        mockFetch((url, init) => {
            if (url === "/api/admin/release-notes") {
                // Stands in for the authorization check (ensureElevated()) — already elevated and
                // authorized, so this succeeds on the first attempt without ElevationHost prompting.
                return jsonResponse(200, {});
            }
            if (url === "/api/profiles/me") {
                return jsonResponse(200, { uid: "admin-1", version: 1, givenName: "Ada", familyName: "Lovelace" });
            }
            if (url === "/api/aliases") {
                return jsonResponse(200, [{ uid: "a1", version: 1, alias: "ada", type: "name", userUid: "admin-1", verified: true }]);
            }
            if (url === "/api/auth/logout") {
                return emptyResponse(200);
            }
            if (url === "/api/settings/branding") {
                return jsonResponse(200, { logoUploaded: false, stylesheetUploaded: false });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(
            <AdminShell userUid="admin-1" section="users">
                content
            </AdminShell>,
        );

        expect(await screen.findByText("content")).toBeInTheDocument();
        const sidebar = screen.getByRole("navigation", { name: "Admin console" });
        expect(within(sidebar).getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin");
        expect(within(sidebar).getByRole("link", { name: "Users" })).toHaveAttribute("title", "Users");
        expect(within(sidebar).getByRole("link", { name: "OAuth Clients" })).toHaveAttribute("href", "/admin/oauth-clients");
        expect(within(sidebar).getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/admin/messages");
        expect(within(sidebar).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/admin/settings");
        expect(within(sidebar).getByRole("link", { name: "RapidREST Admin" })).toHaveAttribute("href", "/admin");
        expect(screen.getByRole("heading", { level: 1, name: "Users" })).toBeInTheDocument();

        const trigger = await screen.findByRole("button", { name: "Account menu for Ada Lovelace" });
        expect(trigger).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("menuitem", { name: "Sign Out" })).not.toBeInTheDocument();

        await user.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(within(screen.getByRole("menu")).getByText("Ada Lovelace")).toBeInTheDocument();

        await user.click(screen.getByRole("menuitem", { name: "Sign Out" }));
        await waitFor(() => expect(location.href).toBe("/auth/signin"));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it.each([
        ["users", "Users"],
        ["oauth-clients", "OAuth Clients"],
        ["messages", "Messages"],
        ["settings", "Settings"],
    ] as const)("highlights only the %s sidebar entry and titles the top bar with it", async (section, label) => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            return jsonResponse(404, { message: "not found" });
        });
        render(
            <AdminShell userUid="admin-1" section={section}>
                content
            </AdminShell>,
        );

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: label })).toBeInTheDocument();
        for (const name of ["Users", "OAuth Clients", "Messages", "Settings"]) {
            const link = screen.getByRole("link", { name });
            if (name === label) {
                expect(link).toHaveAttribute("aria-current", "page");
                expect(link).toHaveClass("rr-admin-sidebar__item--active");
            } else {
                expect(link).not.toHaveAttribute("aria-current");
                expect(link).not.toHaveClass("rr-admin-sidebar__item--active");
            }
        }
    });

    it("titles the top bar with the console's brand when no section is given, and falls back to the uid as the display name", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            // No Profile and no aliases (e.g. a freshly bootstrapped admin account).
            return jsonResponse(404, { message: "not found" });
        });
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "RapidREST Admin" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Account menu for admin-1" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
    });

    it("shows the profile's avatar image in the avatar menu when one is set", async () => {
        mockFetch((url) => {
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/profiles/me") {
                return jsonResponse(200, { uid: "admin-1", version: 1, avatar: "https://example.com/me.png" });
            }
            if (url === "/api/aliases") {
                return jsonResponse(200, [
                    { uid: "a1", version: 1, alias: "root@example.com", type: "email", userUid: "admin-1", verified: true },
                ]);
            }
            return jsonResponse(404, { message: "not found" });
        });
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        const trigger = await screen.findByRole("button", { name: "Account menu for root@example.com" });
        await waitFor(() => expect(trigger.querySelector("img")).toHaveAttribute("src", "https://example.com/me.png"));
    });

    it("renders custom branding and footer, but not the custom header, once site settings resolve", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/settings/branding") {
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

        expect(await screen.findByRole("link", { name: "Acme Inc Admin" })).toBeInTheDocument();
        // The header is for the public pages; the console has its own brand mark and title.
        expect(screen.queryByText("Scheduled maintenance tonight")).not.toBeInTheDocument();
        expect(document.querySelector(".rr-custom-header")).toBeNull();
        expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "© Acme Inc")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Acme Inc Admin" }).querySelector("img")).toHaveAttribute(
            "src",
            "/api/settings/branding/logo",
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
            if (url === "/api/settings/branding") {
                return jsonResponse(200, { logoUploaded: true, iconUploaded: true, stylesheetUploaded: false });
            }
            throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
        });
        render(<AdminShell userUid="admin-1">content</AdminShell>);

        expect(await screen.findByText("content")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "RapidREST Admin" }).querySelector("img")).toHaveAttribute(
            "src",
            "/api/settings/branding/icon",
        );
    });

    it("renders branding from an SSR-provided settings prop, without ever needing its own /api/settings/branding fetch to resolve", async () => {
        mockFetch((url, init) => {
            if (url === "/api/users/me") {
                return jsonResponse(200, { uid: "admin-1", roles: ["admin"], scopes: [] });
            }
            if (url === "/api/admin/release-notes") {
                return jsonResponse(200, {});
            }
            if (url === "/api/settings/branding") {
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

        expect(await screen.findByRole("link", { name: "Acme Inc Admin" })).toBeInTheDocument();
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

describe("resolveDisplayName", () => {
    function alias(type: "email" | "phone" | "name" | "oauth", value: string) {
        return { uid: `alias-${value}`, version: 1, alias: value, type, userUid: "u1", verified: true };
    }

    it("prefers the profile's given and family name", () => {
        const profile = { uid: "u1", version: 1, givenName: "Ada", familyName: "Lovelace" };
        expect(resolveDisplayName("u1", profile, [alias("name", "ada")])).toBe("Ada Lovelace");
    });

    it("uses whichever of the given/family name is set, ignoring blank parts", () => {
        expect(resolveDisplayName("u1", { uid: "u1", version: 1, givenName: " Ada " }, [])).toBe("Ada");
        expect(resolveDisplayName("u1", { uid: "u1", version: 1, givenName: "  ", familyName: "Lovelace" }, [])).toBe(
            "Lovelace",
        );
    });

    it("falls back to the username, then e-mail, then phone alias, never an oauth alias", () => {
        const aliases = [alias("oauth", "google-123"), alias("phone", "+15551234567"), alias("email", "a@example.com")];
        expect(resolveDisplayName("u1", null, [...aliases, alias("name", "ada")])).toBe("ada");
        expect(resolveDisplayName("u1", { uid: "u1", version: 1 }, aliases)).toBe("a@example.com");
        expect(resolveDisplayName("u1", null, [alias("oauth", "google-123"), alias("phone", "+15551234567")])).toBe(
            "+15551234567",
        );
    });

    it("falls back to the uid when there is no name and no displayable alias", () => {
        expect(resolveDisplayName("u1", null, [alias("oauth", "google-123")])).toBe("u1");
    });
});
