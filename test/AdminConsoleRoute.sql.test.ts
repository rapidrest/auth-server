///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// See `wwwRoute.sql.test.ts`'s own doc comment — identical rationale, for the admin console's route.
import { describe, expect, it, vi } from "vitest";
import { AdminConsoleRoute } from "../src/sql/routes/AdminConsoleRoute.js";

function withFakeObjectFactory(route: AdminConsoleRoute, repoUtils: Record<string, any>): void {
    (route as any).siteSettingsObjectFactory = { newInstance: vi.fn().mockResolvedValue(repoUtils) };
}

describe("AdminConsoleRoute.fetchProps() (sql)", () => {
    it("returns { siteSettings } from the current settings row", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(route, {
            findOne: vi.fn().mockResolvedValue({ uid: "default", companyName: "Acme Inc" }),
        });

        const props = await (route as any).fetchProps({});

        expect(props.siteSettings.companyName).toBe("Acme Inc");
    });

    it("falls back to safe defaults instead of throwing when the settings read fails", async () => {
        const route = new AdminConsoleRoute();
        withFakeObjectFactory(route, { findOne: vi.fn().mockRejectedValue(new Error("db down")) });

        const props = await (route as any).fetchProps({});

        expect(props).toEqual({ siteSettings: { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false } });
    });
});
