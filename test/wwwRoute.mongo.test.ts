///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// See `wwwRoute.sql.test.ts`'s own doc comment — identical rationale; this is its Mongo twin.
import { describe, expect, it, vi } from "vitest";
import { SystemSettingsUtils } from "@rapidrest/auth";
import { WwwRoute } from "../src/mongo/routes/wwwRoute.js";

function withFakeObjectFactory(route: WwwRoute, repoUtils: Record<string, any>, allowRegistration = true): void {
    const systemSettingsUtils = { get: vi.fn().mockResolvedValue({ allowRegistration }) };
    (route as any).siteSettingsObjectFactory = {
        newInstance: vi.fn(async (type: any) => (type === SystemSettingsUtils ? systemSettingsUtils : repoUtils)),
    };
}

describe("WwwRoute.fetchProps() (mongo)", () => {
    it("returns { siteSettings, systemSettings } from the current settings rows", async () => {
        const route = new WwwRoute();
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
        const route = new WwwRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockResolvedValue({ uid: "default" }) });
        (route as any).corsOrigins = ["https://mail.mydomain.com/inbox", "*", "not a url"];

        const props = await (route as any).fetchProps({});

        expect(props.returnToOrigins).toEqual(["https://mail.mydomain.com"]);
    });

    it("falls back to safe defaults for siteSettings when that read fails, independent of systemSettings", async () => {
        const route = new WwwRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) }, true);

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        expect(props.systemSettings).toEqual({ allowRegistration: true });
    });

    it("falls back to safe defaults for systemSettings when that read fails, independent of siteSettings", async () => {
        const route = new WwwRoute();
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
