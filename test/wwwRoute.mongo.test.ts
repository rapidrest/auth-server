///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// See `wwwRoute.sql.test.ts`'s own doc comment — identical rationale; this is its Mongo twin.
import { describe, expect, it, vi } from "vitest";
import { WwwRoute } from "../src/mongo/routes/wwwRoute.js";

function withFakeObjectFactory(route: WwwRoute, repoUtils: Record<string, any>): void {
    (route as any).siteSettingsObjectFactory = { newInstance: vi.fn().mockResolvedValue(repoUtils) };
}

describe("WwwRoute.fetchProps() (mongo)", () => {
    it("returns { siteSettings } from the current settings row", async () => {
        const route = new WwwRoute();
        withFakeObjectFactory(route, {
            findOne: vi.fn().mockResolvedValue({ uid: "default", siteTitle: "Acme" }),
        });

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.siteTitle).toBe("Acme");
    });

    it("falls back to safe defaults instead of throwing when the settings read fails", async () => {
        const route = new WwwRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) });

        const props = await (route as any).fetchProps({});

        expect(props).toEqual({ siteSettings: { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false } });
    });
});
