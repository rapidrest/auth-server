///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// See `wwwRoute.mongo.test.ts`'s own doc comment — identical rationale, for the admin console's route.
import { describe, expect, it, vi } from "vitest";
import { SystemSettingsUtils } from "@rapidrest/auth";
import { AdminConsoleRoute } from "../src/mongo/routes/AdminConsoleRoute.js";

function withFakeObjectFactory(route: AdminConsoleRoute, repoUtils: Record<string, any>, allowRegistration = true): void {
    const systemSettingsUtils = { get: vi.fn().mockResolvedValue({ allowRegistration }) };
    (route as any).siteSettingsObjectFactory = {
        newInstance: vi.fn(async (type: any) => (type === SystemSettingsUtils ? systemSettingsUtils : repoUtils)),
    };
}

describe("AdminConsoleRoute.fetchProps() (mongo)", () => {
    it("returns { siteSettings, systemSettings } from the current settings rows", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(
            route,
            { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true, companyName: "Acme Inc" }) },
            false,
        );

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.companyName).toBe("Acme Inc");
        expect(props.systemSettings.allowRegistration).toBe(false);
    });

    it("seeds the branding row from the site_settings config when it's the first to read it, and shows it", async () => {
        const route = new AdminConsoleRoute();
        const create = vi.fn(async (obj: any) => obj);
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue(undefined), create });
        (route as any).siteSettingsConfig = { siteTitle: "Acme", logoUrl: "/brand/logo.svg" };

        const props = await (route as any).fetchProps({});

        expect(create).toHaveBeenCalledWith(
            { uid: "default", seeded: true, siteTitle: "Acme", logoUrl: "/brand/logo.svg" },
            { ignoreACL: true },
        );
        expect(props.siteSettings).toMatchObject({ siteTitle: "Acme", logoUrl: "/brand/logo.svg" });
    });

    it("fills only the still-empty fields of a row saved before seeding existed, keeping the admin's values", async () => {
        const route = new AdminConsoleRoute();
        const update = vi.fn(async (obj: any) => obj);
        withFakeObjectFactory(route, {
            findOne: vi.fn().mockResolvedValue({ uid: "default", siteTitle: "Admin's Title" }),
            update,
        });
        (route as any).siteSettingsConfig = { siteTitle: "Configured", companyName: "Acme Inc" };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings).toMatchObject({ siteTitle: "Admin's Title", companyName: "Acme Inc" });
        expect(update).toHaveBeenCalledTimes(1);
    });

    it("never consults the site_settings config once the row is seeded, so a field the admin cleared stays cleared", async () => {
        const route = new AdminConsoleRoute();
        const repo = { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }), create: vi.fn(), update: vi.fn() };
        withFakeObjectFactory(route, repo);
        (route as any).siteSettingsConfig = { siteTitle: "Configured" };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBeUndefined();
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("shows the site_settings config's valid branding, not the stock branding, when the row can't be read", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) });
        (route as any).siteSettingsConfig = { siteTitle: "Acme", logoUrl: "javascript:alert(1)" };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings).toEqual({
            siteTitle: "Acme",
            logoUploaded: false,
            iconUploaded: false,
            stylesheetUploaded: false,
        });
    });

    it("falls back to safe defaults for siteSettings when that read fails, independent of systemSettings", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) }, true);

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });

    it("falls back to safe defaults for systemSettings when that read fails, independent of siteSettings", async () => {
        const route = new AdminConsoleRoute();
        const newInstance = vi.fn(async (type: any) => {
            if (type === SystemSettingsUtils) {
                throw new Error("db down");
            }
            return { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true, companyName: "Acme Inc" }) };
        });
        (route as any).siteSettingsObjectFactory = { newInstance };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.companyName).toBe("Acme Inc");
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });
});
