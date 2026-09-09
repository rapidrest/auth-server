// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, ensureElevated: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/siteSettings.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/siteSettings.js")>();
    return { ...actual, getSiteSettings: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../../apps/shared/lib/adminApi.js";
import { getSiteSettings, PublicSiteSettings } from "../../../../apps/shared/lib/siteSettings.js";
import SiteSettingsPage from "../../../../apps/admin/settings/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedEnsureElevated = vi.mocked(ensureElevated);
const mockedGetSiteSettings = vi.mocked(getSiteSettings);

const adminSelf = { uid: "admin-1", version: 1, roles: ["admin"], scopes: [] };
const baseSettings: PublicSiteSettings = { logoUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetSiteSettings.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedEnsureElevated.mockResolvedValue(undefined);
});

describe("SiteSettingsPage", () => {
    it("loads and renders all three settings cards", async () => {
        mockedGetSiteSettings.mockResolvedValue({ ...baseSettings, siteTitle: "Acme Auth" });
        render(<SiteSettingsPage userUid="admin-1" />);

        expect(await screen.findByText("Site settings")).toBeInTheDocument();
        expect(await screen.findByLabelText("Site title")).toHaveValue("Acme Auth");
        expect(screen.getByText("Header & footer")).toBeInTheDocument();
        expect(screen.getByText("Custom stylesheet")).toBeInTheDocument();
    });

    it("shows an error when loading settings fails", async () => {
        mockedGetSiteSettings.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<SiteSettingsPage userUid="admin-1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic error when loading settings fails with a non-API error", async () => {
        mockedGetSiteSettings.mockRejectedValue(new Error("network down"));
        render(<SiteSettingsPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load these settings.")).toBeInTheDocument();
    });
});
