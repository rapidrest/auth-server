// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, mockLocation } from "../testUtils.js";
import { informationFixture, runtimeFixture, versionsFixture } from "./_components/diagnostics/fixtures.js";

vi.mock("../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, ensureElevated: vi.fn() };
});

import { ApiRequestError } from "../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../apps/shared/lib/adminApi.js";
import DiagnosticsPage from "../../../apps/admin/diagnostics.js";

/** Answers the two endpoints the page opens on; anything else (profile, aliases, site settings) is simply not found. */
function mockApi() {
    return mockFetch((url) => {
        switch (url) {
            case "/api/admin/diagnostics/versions":
                return jsonResponse(200, versionsFixture());
            case "/api/admin/diagnostics/information":
                return jsonResponse(200, informationFixture());
            case "/api/admin/diagnostics/runtime":
                return jsonResponse(200, runtimeFixture());
            default:
                return jsonResponse(404, { message: "Not found." });
        }
    });
}

beforeEach(() => {
    vi.mocked(ensureElevated).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("DiagnosticsPage", () => {
    it("is the Diagnostics section of the admin console, with the diagnostics page inside", async () => {
        mockApi();
        render(<DiagnosticsPage userUid="admin-1" />);
        // The console's own top bar has the page's h1, and the page itself an h2.
        expect(await screen.findByRole("heading", { level: 1, name: "Diagnostics" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeInTheDocument();
        expect(await screen.findByRole("region", { name: "Server" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Information" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Download diagnostics report" })).toBeInTheDocument();
    });

    it("highlights Diagnostics in the console's navigation", async () => {
        mockApi();
        render(<DiagnosticsPage userUid="admin-1" />);
        await screen.findByRole("region", { name: "Server" });
        const rail = within(screen.getByRole("navigation", { name: "Admin console" }));
        const link = rail.getByRole("link", { name: "Diagnostics" });
        expect(link).toHaveAttribute("href", "/admin/diagnostics");
        expect(link).toHaveAttribute("aria-current", "page");
        expect(rail.getByRole("link", { name: "Settings" })).not.toHaveAttribute("aria-current");
    });

    it("switches between the tabs inside the console", async () => {
        const user = userEvent.setup();
        mockApi();
        render(<DiagnosticsPage userUid="admin-1" />);
        await screen.findByRole("region", { name: "Server" });
        await user.click(screen.getByRole("tab", { name: "Runtime" }));
        expect(await screen.findByRole("region", { name: "Kubernetes" })).toBeInTheDocument();
        expect(screen.getByText("v1.33.1+k3s1")).toBeInTheDocument();
    });

    it("shows the console's own answer when the administrator is not allowed in", async () => {
        vi.mocked(ensureElevated).mockRejectedValue(new ApiRequestError("No.", 403, "api-103"));
        const fetchMock = mockApi();
        render(<DiagnosticsPage userUid="admin-1" />);
        expect(await screen.findByText("You do not have administrator access.")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Diagnostics" })).not.toBeInTheDocument();
        expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/admin/diagnostics"))).toBe(false);
    });

    it("reads nothing, and sends the visitor to sign in, without a signed-in user", async () => {
        const location = mockLocation();
        const fetchMock = mockApi();
        render(<DiagnosticsPage />);
        await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/auth/signin"));
        expect(screen.queryByRole("heading", { name: "Diagnostics" })).not.toBeInTheDocument();
        expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/admin/diagnostics"))).toBe(false);
    });
});
