///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `AppRoute.fetchProps()`'s own logic, in isolation from a
// live `ObjectFactory`/database and from `@rapidrest/react`'s SSR pipeline (which this test process
// can't dynamically `import()` a raw `.tsx` page file through — see `SiteSettingsRoute.sql.test.ts`
// for the real HTTP-level coverage of `/api/settings` itself). This is the one piece of that route not
// otherwise exercised: `@rapidrest/react` spreads whatever this returns onto every page's props and
// onto `_layout.tsx`, so a failure here would silently degrade every www page's branding.
import { describe, expect, it, vi } from "vitest";
import { AppRoute } from "../src/sql/routes/wwwRoute.js";

function withFakeObjectFactory(route: AppRoute, repoUtils: Record<string, any>): void {
    (route as any).siteSettingsObjectFactory = { newInstance: vi.fn().mockResolvedValue(repoUtils) };
}

describe("AppRoute.fetchProps() (sql)", () => {
    it("returns { siteSettings } from the current settings row", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, {
            findOne: vi.fn().mockResolvedValue({ uid: "default", siteTitle: "Acme" }),
        });

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
    });

    it("falls back to safe defaults instead of throwing when the settings read fails", async () => {
        const route = new AppRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) });

        const props = await (route as any).fetchProps({});

        expect(props).toEqual({ siteSettings: { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false } });
    });
});
