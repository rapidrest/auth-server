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
            { findOne: vi.fn().mockResolvedValue({ uid: "default", siteTitle: "Acme" }) },
            false,
        );

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
        expect(props.systemSettings.allowRegistration).toBe(false);
    });

    it("returns the configured cors origins as normalized returnToOrigins for the sign-in page's return_to check", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default" }) });
        (route as any).corsOrigins = ["https://mail.mydomain.com/inbox", "*", "not a url"];

        const props = await (route as any).fetchProps({});

        expect(props.returnToOrigins).toEqual(["https://mail.mydomain.com"]);
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
            return { findOne: vi.fn().mockResolvedValue({ uid: "default", siteTitle: "Acme" }) };
        });
        (route as any).siteSettingsObjectFactory = { newInstance };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });
});
