///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { SiteSettingsMongo } from "../src/models/mongo/SiteSettingsMongo.js";
import { SiteSettingsSQL } from "../src/models/sql/SiteSettingsSQL.js";

describe.each([
    ["SiteSettingsSQL", SiteSettingsSQL],
    ["SiteSettingsMongo", SiteSettingsMongo],
] as const)("%s", (_name, Model) => {
    it("starts with nothing set, and not seeded", () => {
        const settings = new Model();

        expect(settings.siteTitle).toBeUndefined();
        expect(settings.seeded).toBeUndefined();
    });

    it("takes the seeded marker, and any other fields it's given, leaving the rest unset", () => {
        expect(new Model({ seeded: true })).toMatchObject({ seeded: true, siteTitle: undefined });
        expect(new Model({ seeded: false })).toMatchObject({ seeded: false });
        expect(new Model({ siteTitle: "Acme" })).toMatchObject({ siteTitle: "Acme", seeded: undefined });
    });

    it("takes every field it's given, and keeps the ones it isn't when copying", () => {
        const fields = {
            siteTitle: "Acme",
            companyName: "Acme Inc",
            headerHtml: "<b>Acme</b>",
            footerHtml: "<i>Acme</i>",
            logoUrl: "https://acme.test/logo.svg",
            logoData: "AAAA",
            logoContentType: "image/png",
            iconUrl: "/icon.png",
            iconData: "BBBB",
            iconContentType: "image/webp",
            stylesheetUrl: "/brand.css",
            stylesheetCss: "body {}",
            seeded: true,
        };

        expect(new Model(fields)).toMatchObject(fields);
        expect(new Model({ ...new Model(fields), siteTitle: "Renamed" })).toMatchObject({ ...fields, siteTitle: "Renamed" });
    });

    it("keeps a null, which is how a cleared column comes back, rather than treating it as unset", () => {
        const settings = new Model({ siteTitle: null as any, seeded: null as any });

        expect(settings.siteTitle).toBeNull();
        expect(settings.seeded).toBeNull();
    });

    it("carries the seeded marker through the copy an update is built from", () => {
        const existing = new Model({ uid: "default", siteTitle: "Acme", seeded: true });

        expect(new Model({ ...existing, siteTitle: "New" })).toMatchObject({ siteTitle: "New", seeded: true });
    });
});
