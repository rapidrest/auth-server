// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, ensureElevated: vi.fn() };
});

vi.mock("../../../apps/shared/lib/siteSettings.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/siteSettings.js")>();
    return { ...actual, getSiteSettings: vi.fn() };
});

vi.mock("../../../apps/shared/lib/systemSettings.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/systemSettings.js")>();
    return { ...actual, getSystemSettings: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../apps/shared/lib/adminApi.js";
import { getSiteSettings, PublicSiteSettings } from "../../../apps/shared/lib/siteSettings.js";
import { getSystemSettings } from "../../../apps/shared/lib/systemSettings.js";
import SiteSettingsPage from "../../../apps/admin/settings.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedEnsureElevated = vi.mocked(ensureElevated);
const mockedGetSiteSettings = vi.mocked(getSiteSettings);
const mockedGetSystemSettings = vi.mocked(getSystemSettings);

const adminSelf = { uid: "admin-1", version: 1, roles: ["admin"], scopes: [] };
const baseSettings: PublicSiteSettings = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetSiteSettings.mockReset();
    mockedGetSystemSettings.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedEnsureElevated.mockResolvedValue(undefined);
    mockedGetSystemSettings.mockResolvedValue({ allowRegistration: true, requireMFA: false });
});

describe("SiteSettingsPage", () => {
    it("loads and renders all five settings cards", async () => {
        mockedGetSiteSettings.mockResolvedValue({ ...baseSettings, siteTitle: "Acme Auth" });
        mockedGetSystemSettings.mockResolvedValue({ allowRegistration: false, requireMFA: false });
        render(<SiteSettingsPage userUid="admin-1" />);

        expect(await screen.findByText("Site settings")).toBeInTheDocument();
        expect(await screen.findByLabelText("Site title")).toHaveValue("Acme Auth");
        expect(screen.getByText("Icon")).toBeInTheDocument();
        expect(screen.getByText("Header & footer")).toBeInTheDocument();
        expect(screen.getByText("Custom stylesheet")).toBeInTheDocument();
        expect(screen.getByText("Registration & Security")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).not.toBeChecked();
    });

    it("renders the RegistrationCard from the server-injected systemSettings prop before the client fetch resolves", async () => {
        mockedGetSiteSettings.mockResolvedValue(baseSettings);
        // Never resolves during this test — proves the card renders from `initialSystemSettings` alone,
        // not from this (still-pending) client-side fetch.
        mockedGetSystemSettings.mockReturnValue(new Promise(() => undefined));
        render(<SiteSettingsPage userUid="admin-1" systemSettings={{ allowRegistration: false, requireMFA: true }} />);

        expect(await screen.findByText("Registration & Security")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).not.toBeChecked();
        expect(screen.getByRole("switch", { name: "Require multi-factor authentication" })).toBeChecked();
    });

    it("highlights the Settings sidebar entry and titles the top bar accordingly", async () => {
        mockedGetSiteSettings.mockResolvedValue(baseSettings);
        render(<SiteSettingsPage userUid="admin-1" />);

        expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
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

    it("shows an error when loading the system settings fails, independent of site settings", async () => {
        mockedGetSiteSettings.mockResolvedValue(baseSettings);
        mockedGetSystemSettings.mockRejectedValue(new ApiRequestError("system boom", 500));
        render(<SiteSettingsPage userUid="admin-1" />);
        expect(await screen.findByText("system boom")).toBeInTheDocument();
    });
});
