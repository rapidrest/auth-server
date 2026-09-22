///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `AppRoute.fetchProps()`'s own logic, in isolation from a
// live `ObjectFactory`/database and from `@rapidrest/react`'s SSR pipeline (which this test process
// can't dynamically `import()` a raw `.tsx` page file through — see `SiteSettingsRoute.sql.test.ts` for
// the real HTTP-level coverage of `/api/settings/branding`, and `SettingsRoute.sql.test.ts` for
// `/api/settings`). This is the one piece of that route not otherwise exercised: `@rapidrest/react`
// spreads whatever this returns onto every page's props and onto `_layout.tsx`, so a failure here would
// silently degrade every www page's branding (or its registration-closed messaging).
import { describe, expect, it, vi } from "vitest";
import { SystemSettingsUtils } from "@rapidrest/auth";
import {
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_FACEBOOK_CLIENT_ID,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_ID,
} from "../src/config.defaults.js";
import { AppRoute } from "../src/sql/routes/wwwRoute.js";

function withFakeObjectFactory(route: AppRoute, repoUtils: Record<string, any>, allowRegistration = true): void {
    const systemSettingsUtils = { get: vi.fn().mockResolvedValue({ allowRegistration }) };
    (route as any).siteSettingsObjectFactory = {
        newInstance: vi.fn(async (type: any) => (type === SystemSettingsUtils ? systemSettingsUtils : repoUtils)),
    };
}

describe("AppRoute.fetchProps() (sql)", () => {
    it("returns { siteSettings, systemSettings } from the current settings rows", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(
            route,
            { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true, siteTitle: "Acme" }) },
            false,
        );

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
        expect(props.systemSettings.allowRegistration).toBe(false);
    });

    it("returns the configured cors origins as normalized returnToOrigins for the sign-in page's return_to check", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }) });
        (route as any).corsOrigins = ["https://mail.mydomain.com/inbox", "*", "not a url"];

        const props = await (route as any).fetchProps({});

        expect(props.returnToOrigins).toEqual(["https://mail.mydomain.com"]);
    });

    it("returns no oauthProviders while every provider's clientID is still its shipped placeholder", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }) });
        (route as any).googleClientID = DEFAULT_GOOGLE_CLIENT_ID;
        (route as any).microsoftClientID = DEFAULT_MICROSOFT_CLIENT_ID;
        (route as any).appleClientID = DEFAULT_APPLE_CLIENT_ID;
        (route as any).facebookClientID = DEFAULT_FACEBOOK_CLIENT_ID;

        const props = await (route as any).fetchProps({});

        expect(props.oauthProviders).toEqual([]);
    });

    it("returns only the oauthProviders whose clientID has been replaced", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }) });
        (route as any).googleClientID = "real.apps.googleusercontent.com";
        (route as any).microsoftClientID = DEFAULT_MICROSOFT_CLIENT_ID;
        (route as any).appleClientID = "com.acme.signin";
        (route as any).facebookClientID = DEFAULT_FACEBOOK_CLIENT_ID;

        const props = await (route as any).fetchProps({});

        expect(props.oauthProviders).toEqual(["google", "apple"]);
    });

    it("returns the configured app_url as appUrl for the account page's Return to App button", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }) });
        (route as any).appUrl = " https://app.mydomain.com/home ";

        const props = await (route as any).fetchProps({});

        expect(props.appUrl).toBe("https://app.mydomain.com/home");
    });

    it("returns an empty appUrl when app_url is unset or isn't an absolute http(s) URL", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }) });

        expect(((await (route as any).fetchProps({}))).appUrl).toBe("");

        (route as any).appUrl = "javascript:alert(1)";
        expect(((await (route as any).fetchProps({}))).appUrl).toBe("");
    });

    it("seeds the branding row from the site_settings config when it's the first to read it, and shows it", async () => {
        const route = new AppRoute();
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
        const route = new AppRoute();
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
        const route = new AppRoute();
        const repo = { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true }), create: vi.fn(), update: vi.fn() };
        withFakeObjectFactory(route, repo);
        (route as any).siteSettingsConfig = { siteTitle: "Configured" };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBeUndefined();
        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("shows the site_settings config's valid branding, not the stock branding, when the row can't be read", async () => {
        const route = new AppRoute();
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
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) }, true);

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });

    it("falls back to safe defaults for systemSettings when that read fails, independent of siteSettings", async () => {
        const route = new AppRoute();
        const newInstance = vi.fn(async (type: any) => {
            if (type === SystemSettingsUtils) {
                throw new Error("db down");
            }
            return { findOne: vi.fn().mockResolvedValue({ uid: "default", seeded: true, siteTitle: "Acme" }) };
        });
        (route as any).siteSettingsObjectFactory = { newInstance };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });
});
