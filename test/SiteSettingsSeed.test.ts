///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { SITE_SETTINGS_SEED_FIELDS, siteSettingsSeedFromConfig } from "../src/routes/SiteSettingsSeed.js";

describe("siteSettingsSeedFromConfig()", () => {
    it("takes every seedable field, trimmed, with nothing rejected", () => {
        const seed = siteSettingsSeedFromConfig({
            siteTitle: "  RapidMX ",
            companyName: "RapidMX Inc",
            headerHtml: "<b>Hi</b>\n",
            footerHtml: "<i>Bye</i>",
            logoUrl: "https://cdn.rapidmx.test/logo.svg",
            iconUrl: "/brand/icon.png",
            stylesheetUrl: "http://cdn.rapidmx.test/brand.css?v=2",
        });

        expect(seed.rejected).toEqual([]);
        expect(seed.fields).toEqual({
            siteTitle: "RapidMX",
            companyName: "RapidMX Inc",
            headerHtml: "<b>Hi</b>",
            footerHtml: "<i>Bye</i>",
            logoUrl: "https://cdn.rapidmx.test/logo.svg",
            iconUrl: "/brand/icon.png",
            stylesheetUrl: "http://cdn.rapidmx.test/brand.css?v=2",
        });
        expect(Object.keys(seed.fields).sort()).toEqual([...SITE_SETTINGS_SEED_FIELDS].sort());
    });

    it("treats nothing configured as nothing to seed", () => {
        for (const configured of [undefined, null, {}]) {
            expect(siteSettingsSeedFromConfig(configured)).toEqual({ fields: {}, rejected: [] });
        }
    });

    it("treats a blank value, or a null one, as unset rather than as a mistake", () => {
        const seed = siteSettingsSeedFromConfig({ siteTitle: "", companyName: "   ", headerHtml: null, logoUrl: "\n" });

        expect(seed).toEqual({ fields: {}, rejected: [] });
    });

    it("matches a key's name in any case", () => {
        const seed = siteSettingsSeedFromConfig({ SITETITLE: "A", companyname: "B", LogoUrl: "/c.png" });

        expect(seed.fields).toEqual({ siteTitle: "A", companyName: "B", logoUrl: "/c.png" });
        expect(seed.rejected).toEqual([]);
    });

    it("accepts a number for a title, since an environment value such as 2024 is parsed into one", () => {
        expect(siteSettingsSeedFromConfig({ siteTitle: 2024 }).fields).toEqual({ siteTitle: "2024" });
    });

    it("rejects a value of the wrong type, naming the setting", () => {
        const seed = siteSettingsSeedFromConfig({
            siteTitle: true,
            companyName: NaN,
            headerHtml: 5,
            footerHtml: ["a"],
            logoUrl: { url: "/x" },
            iconUrl: 7,
        });

        expect(seed.fields).toEqual({});
        expect(seed.rejected).toEqual([
            "site_settings.siteTitle must be a string",
            "site_settings.companyName must be a string",
            "site_settings.headerHtml must be a string",
            "site_settings.footerHtml must be a string",
            "site_settings.logoUrl must be a string",
            "site_settings.iconUrl must be a string",
        ]);
    });

    it.each([
        "https://example.com/logo.png",
        "http://example.com/logo.png",
        "HTTPS://EXAMPLE.COM/logo.png",
        "https://example.com:8443/a/b.css?x=1#y",
        "http://localhost:3000/logo.svg",
        "/logo.png",
        "/brand/icon.svg?v=3",
        "/",
    ])("accepts %s as a reference URL", (url) => {
        const seed = siteSettingsSeedFromConfig({ logoUrl: url });

        expect(seed.rejected).toEqual([]);
        expect(seed.fields.logoUrl).toBe(url);
    });

    it.each([
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:image/svg+xml;base64,AAAA",
        "file:///etc/passwd",
        "ftp://example.com/logo.png",
        "//evil.example/logo.png",
        "/\\evil.example/logo.png",
        "/logo\\..\\x.png",
        "logo.png",
        "example.com/logo.png",
        "https://",
        "https://exa mple.com/logo.png",
        "/logo .png",
        "https://example.com/logo.png\nhttps://evil.example",
        "/logo\u0000.png",
    ])("rejects %j as a reference URL", (url) => {
        const seed = siteSettingsSeedFromConfig({ iconUrl: url });

        expect(seed.fields).toEqual({});
        expect(seed.rejected).toEqual(["site_settings.iconUrl must be an http(s) URL or a path starting with a single /"]);
    });

    it("bounds how much it will seed", () => {
        const long = (n: number) => "x".repeat(n);

        expect(siteSettingsSeedFromConfig({ siteTitle: long(255), headerHtml: long(100_000), logoUrl: `/${long(2047)}` }).rejected).toEqual(
            [],
        );
        expect(
            siteSettingsSeedFromConfig({ siteTitle: long(256), companyName: long(300), headerHtml: long(100_001), logoUrl: `/${long(2048)}` })
                .rejected,
        ).toEqual([
            "site_settings.siteTitle is longer than 255 characters",
            "site_settings.companyName is longer than 255 characters",
            "site_settings.headerHtml is longer than 100000 characters",
            "site_settings.logoUrl is longer than 2048 characters",
        ]);
    });

    it("reports a key that isn't a seedable setting — a typo, or an upload — and never seeds it", () => {
        const seed = siteSettingsSeedFromConfig({ title: "x", logoData: "AAAA", stylesheetCss: "body{}", siteTitle: "Fine" });

        expect(seed.fields).toEqual({ siteTitle: "Fine" });
        expect(seed.rejected).toHaveLength(3);
        expect(seed.rejected[0]).toContain("site_settings.title is not a setting that can be set from config");
        expect(seed.rejected[1]).toContain("site_settings.logoData is not a setting");
        expect(seed.rejected[2]).toContain("site_settings.stylesheetCss is not a setting");
    });

    it("keeps the valid values when others are refused", () => {
        const seed = siteSettingsSeedFromConfig({ siteTitle: "Fine", logoUrl: "javascript:x", footerHtml: "<i>ok</i>" });

        expect(seed.fields).toEqual({ siteTitle: "Fine", footerHtml: "<i>ok</i>" });
        expect(seed.rejected).toHaveLength(1);
    });

    it("rejects a config value that isn't an object, without throwing", () => {
        for (const configured of ["RapidMX", 5, true, ["siteTitle"]]) {
            expect(siteSettingsSeedFromConfig(configured)).toEqual({
                fields: {},
                rejected: ["site_settings must be an object of setting names to values"],
            });
        }
    });
});
