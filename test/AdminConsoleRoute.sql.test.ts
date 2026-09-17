///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// See `wwwRoute.sql.test.ts`'s own doc comment — identical rationale, for the admin console's route.
import { describe, expect, it, vi } from "vitest";
import { SystemSettingsUtils } from "@rapidrest/auth";
import { AdminConsoleRoute } from "../src/sql/routes/AdminConsoleRoute.js";

function withFakeObjectFactory(route: AdminConsoleRoute, repoUtils: Record<string, any>, allowRegistration = true): void {
    const systemSettingsUtils = { get: vi.fn().mockResolvedValue({ allowRegistration }) };
    (route as any).siteSettingsObjectFactory = {
        newInstance: vi.fn(async (type: any) => (type === SystemSettingsUtils ? systemSettingsUtils : repoUtils)),
    };
}

describe("AdminConsoleRoute.fetchProps() (sql)", () => {
    it("returns { siteSettings, systemSettings } from the current settings rows", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(
            route,
            { findOne: vi.fn().mockResolvedValue({ uid: "default", companyName: "Acme Inc" }) },
            false,
        );

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.companyName).toBe("Acme Inc");
        expect(props.systemSettings.allowRegistration).toBe(false);
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
            return { findOne: vi.fn().mockResolvedValue({ uid: "default", companyName: "Acme Inc" }) };
        });
        (route as any).siteSettingsObjectFactory = { newInstance };

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.companyName).toBe("Acme Inc");
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });
});
