///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level coverage for `BaseSiteSettingsRoute`'s own logic (get-or-create, partial-update
// null-vs-undefined semantics, upload validation, and the base64<->Buffer round trip for the binary
// serving endpoints), driven directly against a stubbed `repoUtils` rather than a live server — the
// full HTTP stack (ACL bypass, trusted-role gating, real persistence) is already covered end-to-end by
// `SiteSettingsRoute.sql.test.ts`/`.mongo.test.ts`; this file exists because those tests' HTTP helper
// reads every response as text, which isn't safe for asserting exact binary content.
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@rapidrest/core";
import { ApiErrors } from "@rapidrest/service-core";
import {
    BaseSiteSettingsRoute,
    fetchSiteSettingsPropsForSSR,
    getOrCreateSiteSettings,
    readPublicSiteSettings,
} from "../src/routes/BaseSiteSettingsRoute.js";
import { SiteSettingsSQL } from "../src/models/sql/SiteSettingsSQL.js";
import { SiteSettingsMongo } from "../src/models/mongo/SiteSettingsMongo.js";

class TestSiteSettingsRoute extends BaseSiteSettingsRoute<SiteSettingsSQL> {
    protected settingsClass = SiteSettingsSQL;
}

function makeRoute(repoUtils: Record<string, any>): TestSiteSettingsRoute {
    const route = new TestSiteSettingsRoute();
    (route as any).repoUtils = repoUtils;
    return route;
}

function makeReq(contentType: string | string[] | undefined, body: any): any {
    return { headers: { "content-type": contentType }, body };
}

function makeRes(): any {
    return {
        setHeader: vi.fn(),
        end: vi.fn(),
        status: vi.fn().mockReturnThis(),
    };
}

describe("BaseSiteSettingsRoute", () => {
    describe("initialize()", () => {
        it("throws when the ObjectFactory was never injected", async () => {
            const route = new TestSiteSettingsRoute();
            await expect((route as any).initialize()).rejects.toThrow("objectFactory is not set.");
        });

        it("does not recreate repoUtils if it's already set", async () => {
            const route = new TestSiteSettingsRoute();
            const existingRepoUtils = {};
            (route as any).repoUtils = existingRepoUtils;
            (route as any)._objectFactory = { newInstance: vi.fn() };

            await (route as any).initialize();

            expect((route as any)._objectFactory.newInstance).not.toHaveBeenCalled();
            expect((route as any).repoUtils).toBe(existingRepoUtils);
        });
    });

    describe("uninitialized repoUtils guards", () => {
        it("getSettings() throws INTERNAL_ERROR when repoUtils is unset", async () => {
            const route = new TestSiteSettingsRoute();
            await expect(route.getSettings()).rejects.toMatchObject({ code: ApiErrors.INTERNAL_ERROR });
        });

        it("updateSettings() throws INTERNAL_ERROR when repoUtils is unset", async () => {
            const route = new TestSiteSettingsRoute();
            await expect(route.updateSettings({})).rejects.toMatchObject({ code: ApiErrors.INTERNAL_ERROR });
        });

        it("resetSettings() throws INTERNAL_ERROR when repoUtils is unset", async () => {
            const route = new TestSiteSettingsRoute();
            await expect(route.resetSettings()).rejects.toMatchObject({ code: ApiErrors.INTERNAL_ERROR });
        });
    });

    describe("getSettings / getOrCreate", () => {
        it("creates the default row (all fields unset) on first access", async () => {
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockImplementation(async (obj) => new SiteSettingsSQL(obj)),
            };
            const route = makeRoute(repoUtils);

            const result = await route.getSettings();

            expect(repoUtils.create).toHaveBeenCalledWith({ uid: "default", seeded: true }, { ignoreACL: true });
            expect(result).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        });

        it("returns the existing row without creating one when it's already present", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Acme" });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing), create: vi.fn() };
            const route = makeRoute(repoUtils);

            const result = await route.getSettings();

            expect(repoUtils.create).not.toHaveBeenCalled();
            expect(result.siteTitle).toBe("Acme");
        });

        it("recovers from a concurrent-create race by re-fetching the now-existing row", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Acme" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(existing),
                create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
            };
            const route = makeRoute(repoUtils);

            const result = await route.getSettings();

            expect(result.siteTitle).toBe("Acme");
        });

        it("re-throws a create failure that isn't a recoverable identifier collision", async () => {
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockRejectedValue(new Error("boom")),
            };
            const route = makeRoute(repoUtils);

            await expect(route.getSettings()).rejects.toThrow("boom");
        });

        it("re-throws IDENTIFIER_EXISTS when the recovery re-fetch also comes back empty", async () => {
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
            };
            const route = makeRoute(repoUtils);

            await expect(route.getSettings()).rejects.toMatchObject({ code: ApiErrors.IDENTIFIER_EXISTS });
        });
    });

    describe("updateSettings", () => {
        it("leaves omitted fields untouched and clears an explicit null", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Old", companyName: "OldCo" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.updateSettings({ companyName: null });

            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg.siteTitle).toBe("Old");
            expect(mergedArg.companyName).toBeNull();
            expect(result.siteTitle).toBe("Old");
            expect(result.companyName).toBeUndefined();
        });

        it("sets every provided field", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.updateSettings({
                siteTitle: "Acme",
                companyName: "Acme Inc",
                headerHtml: "<b>hi</b>",
                footerHtml: "<i>bye</i>",
                logoUrl: "https://example.com/logo.png",
                iconUrl: "https://example.com/icon.png",
                stylesheetUrl: "https://example.com/style.css",
            });

            expect(result).toMatchObject({
                siteTitle: "Acme",
                companyName: "Acme Inc",
                headerHtml: "<b>hi</b>",
                footerHtml: "<i>bye</i>",
                logoUrl: "https://example.com/logo.png",
                iconUrl: "https://example.com/icon.png",
                stylesheetUrl: "https://example.com/style.css",
            });
        });
    });

    describe("resetSettings", () => {
        it("clears every field when nothing is configured, including an uploaded logo/icon/stylesheet", async () => {
            const existing = new SiteSettingsSQL({
                uid: "default",
                seeded: true,
                siteTitle: "Admin's",
                logoUrl: "https://example.com/old.png",
                logoData: "Zm9v",
                logoContentType: "image/png",
                iconData: "YmFy",
                iconContentType: "image/png",
                stylesheetCss: "body{}",
            });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.resetSettings();

            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg).toMatchObject({
                siteTitle: null,
                companyName: null,
                headerHtml: null,
                footerHtml: null,
                logoUrl: null,
                iconUrl: null,
                stylesheetUrl: null,
                logoData: null,
                logoContentType: null,
                iconData: null,
                iconContentType: null,
                stylesheetCss: null,
            });
            expect(result).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        });

        it("sets every field the config provides, and clears the rest", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, footerHtml: "Admin's footer" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);
            (route as any).configuredSiteSettings = { siteTitle: "RapidMX", logoUrl: "https://cdn.rapidmx.test/logo.svg" };

            const result = await route.resetSettings();

            expect(result).toMatchObject({ siteTitle: "RapidMX", logoUrl: "https://cdn.rapidmx.test/logo.svg" });
            expect(result.footerHtml).toBeUndefined();
        });
    });

    describe("uploadLogo", () => {
        it("stores base64-encoded bytes and the normalized content type", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);
            const bytes = Buffer.from([1, 2, 3, 4]);

            const result = await route.uploadLogo(makeReq("image/png", bytes));

            expect(result.logoUploaded).toBe(true);
            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg.logoData).toBe(bytes.toString("base64"));
            expect(mergedArg.logoContentType).toBe("image/png");
        });

        it("normalizes an array content-type header value and strips charset params", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);
            const bytes = Buffer.from([1]);

            await route.uploadLogo(makeReq(["IMAGE/PNG; charset=binary"], bytes));

            expect(repoUtils.update.mock.calls[0][0].logoContentType).toBe("image/png");
        });

        it("rejects a missing content-type", async () => {
            const route = makeRoute({});
            await expect(route.uploadLogo(makeReq(undefined, Buffer.from([1])))).rejects.toThrow();
        });

        it("rejects an unsupported content-type", async () => {
            const route = makeRoute({});
            await expect(route.uploadLogo(makeReq("application/pdf", Buffer.from([1])))).rejects.toThrow();
        });

        it("rejects a non-Buffer body", async () => {
            const route = makeRoute({});
            await expect(route.uploadLogo(makeReq("image/png", "not-a-buffer"))).rejects.toThrow();
        });

        it("rejects an empty body", async () => {
            const route = makeRoute({});
            await expect(route.uploadLogo(makeReq("image/png", Buffer.alloc(0)))).rejects.toThrow();
        });

        it("rejects an oversized body", async () => {
            const route = makeRoute({});
            await expect(route.uploadLogo(makeReq("image/png", Buffer.alloc(2 * 1024 * 1024 + 1)))).rejects.toThrow();
        });
    });

    describe("deleteLogo", () => {
        it("clears the uploaded logo fields", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, logoData: "abc", logoContentType: "image/png" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.deleteLogo();

            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg.logoData).toBeNull();
            expect(mergedArg.logoContentType).toBeNull();
            expect(result.logoUploaded).toBe(false);
        });
    });

    describe("getLogo", () => {
        it("streams the exact decoded bytes with the stored content type", async () => {
            const bytes = Buffer.from([9, 8, 7, 6, 5]);
            const existing = new SiteSettingsSQL({
                uid: "default",
                seeded: true,
                logoData: bytes.toString("base64"),
                logoContentType: "image/png",
            });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getLogo(res);

            expect(res.setHeader).toHaveBeenCalledWith("content-type", "image/png");
            const [sentBuffer] = res.end.mock.calls[0];
            expect(Buffer.compare(sentBuffer, bytes)).toBe(0);
        });

        it("404s when no logo has been uploaded", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getLogo(res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.end).toHaveBeenCalled();
        });
    });

    describe("uploadIcon", () => {
        it("stores base64-encoded bytes and the normalized content type", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);
            const bytes = Buffer.from([1, 2, 3, 4]);

            const result = await route.uploadIcon(makeReq("image/png", bytes));

            expect(result.iconUploaded).toBe(true);
            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg.iconData).toBe(bytes.toString("base64"));
            expect(mergedArg.iconContentType).toBe("image/png");
        });

        it("normalizes an array content-type header value and strips charset params", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);
            const bytes = Buffer.from([1]);

            await route.uploadIcon(makeReq(["IMAGE/PNG; charset=binary"], bytes));

            expect(repoUtils.update.mock.calls[0][0].iconContentType).toBe("image/png");
        });

        it("rejects a missing content-type", async () => {
            const route = makeRoute({});
            await expect(route.uploadIcon(makeReq(undefined, Buffer.from([1])))).rejects.toThrow();
        });

        it("rejects an unsupported content-type", async () => {
            const route = makeRoute({});
            await expect(route.uploadIcon(makeReq("application/pdf", Buffer.from([1])))).rejects.toThrow();
        });

        it("rejects a non-Buffer body", async () => {
            const route = makeRoute({});
            await expect(route.uploadIcon(makeReq("image/png", "not-a-buffer"))).rejects.toThrow();
        });

        it("rejects an empty body", async () => {
            const route = makeRoute({});
            await expect(route.uploadIcon(makeReq("image/png", Buffer.alloc(0)))).rejects.toThrow();
        });

        it("rejects an oversized body", async () => {
            const route = makeRoute({});
            await expect(route.uploadIcon(makeReq("image/png", Buffer.alloc(512 * 1024 + 1)))).rejects.toThrow();
        });
    });

    describe("deleteIcon", () => {
        it("clears the uploaded icon fields", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, iconData: "abc", iconContentType: "image/png" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.deleteIcon();

            const [mergedArg] = repoUtils.update.mock.calls[0];
            expect(mergedArg.iconData).toBeNull();
            expect(mergedArg.iconContentType).toBeNull();
            expect(result.iconUploaded).toBe(false);
        });
    });

    describe("getIcon", () => {
        it("streams the exact decoded bytes with the stored content type", async () => {
            const bytes = Buffer.from([9, 8, 7, 6, 5]);
            const existing = new SiteSettingsSQL({
                uid: "default",
                seeded: true,
                iconData: bytes.toString("base64"),
                iconContentType: "image/png",
            });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getIcon(res);

            expect(res.setHeader).toHaveBeenCalledWith("content-type", "image/png");
            const [sentBuffer] = res.end.mock.calls[0];
            expect(Buffer.compare(sentBuffer, bytes)).toBe(0);
        });

        it("404s when no icon has been uploaded", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getIcon(res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.end).toHaveBeenCalled();
        });
    });

    describe("uploadStylesheet", () => {
        it("stores the raw CSS text from a string body", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.uploadStylesheet(makeReq("text/css", "body { color: red; }"));

            expect(result.stylesheetUploaded).toBe(true);
            expect(repoUtils.update.mock.calls[0][0].stylesheetCss).toBe("body { color: red; }");
        });

        it("stores the raw CSS text from a Buffer body", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            await route.uploadStylesheet(makeReq("text/css", Buffer.from("body { color: blue; }", "utf8")));

            expect(repoUtils.update.mock.calls[0][0].stylesheetCss).toBe("body { color: blue; }");
        });

        it("rejects a body of an unsupported type", async () => {
            const route = makeRoute({});
            await expect(route.uploadStylesheet(makeReq("text/css", 12345))).rejects.toThrow();
        });

        it("rejects an empty body", async () => {
            const route = makeRoute({});
            await expect(route.uploadStylesheet(makeReq("text/css", ""))).rejects.toThrow();
        });

        it("rejects an oversized body", async () => {
            const route = makeRoute({});
            await expect(route.uploadStylesheet(makeReq("text/css", "a".repeat(512 * 1024 + 1)))).rejects.toThrow();
        });
    });

    describe("deleteStylesheet", () => {
        it("clears the uploaded stylesheet field", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, stylesheetCss: "body {}" });
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(existing),
                update: vi.fn().mockImplementation(async (merged) => merged),
            };
            const route = makeRoute(repoUtils);

            const result = await route.deleteStylesheet();

            expect(repoUtils.update.mock.calls[0][0].stylesheetCss).toBeNull();
            expect(result.stylesheetUploaded).toBe(false);
        });
    });

    describe("getStylesheet", () => {
        it("streams the exact stored CSS text with a text/css content type", async () => {
            const css = "body { color: green; }";
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true, stylesheetCss: css });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getStylesheet(res);

            expect(res.setHeader).toHaveBeenCalledWith("content-type", "text/css");
            const [sentBuffer] = res.end.mock.calls[0];
            expect(sentBuffer.toString("utf8")).toBe(css);
        });

        it("404s when no stylesheet has been uploaded", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", seeded: true });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getStylesheet(res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.end).toHaveBeenCalled();
        });
    });
});

// readPublicSiteSettings()/fetchSiteSettingsPropsForSSR() are consumed by wwwRoute/AdminConsoleRoute
// (src/{sql,mongo}/routes/{wwwRoute,AdminConsoleRoute}.ts) to feed SSR branding into page props/
// _layout.tsx without an HTTP round-trip — see those files' own fetchProps() overrides.
function fakeObjectFactory(repoUtils: Record<string, any>): any {
    return { newInstance: vi.fn().mockResolvedValue(repoUtils) };
}

describe("readPublicSiteSettings", () => {
    it("creates the default row (all fields unset) on first access", async () => {
        const repoUtils = {
            findOne: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockImplementation(async (obj) => new SiteSettingsSQL(obj)),
        };
        const objectFactory = fakeObjectFactory(repoUtils);

        const result = await readPublicSiteSettings(objectFactory, SiteSettingsSQL, null);

        expect(objectFactory.newInstance).toHaveBeenCalledWith(expect.anything(), {
            name: SiteSettingsSQL.name,
            args: [SiteSettingsSQL],
        });
        expect(repoUtils.create).toHaveBeenCalledWith({ uid: "default", seeded: true }, { ignoreACL: true });
        expect(result).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
    });

    it("returns the existing row without creating one when it's already present", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Acme" });
        const repoUtils = { findOne: vi.fn().mockResolvedValue(existing), create: vi.fn() };

        const result = await readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL, null);

        expect(repoUtils.create).not.toHaveBeenCalled();
        expect(result.siteTitle).toBe("Acme");
    });

    it("recovers from a concurrent-create race by re-fetching the now-existing row", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Acme" });
        const repoUtils = {
            findOne: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(existing),
            create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
        };

        const result = await readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL, null);

        expect(result.siteTitle).toBe("Acme");
    });

    it("re-throws a create failure that isn't a recoverable identifier collision", async () => {
        const repoUtils = {
            findOne: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockRejectedValue(new Error("boom")),
        };

        await expect(readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL, null)).rejects.toThrow("boom");
    });

    it("re-throws IDENTIFIER_EXISTS when the recovery re-fetch also comes back empty", async () => {
        const repoUtils = {
            findOne: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
        };

        await expect(readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL, null)).rejects.toMatchObject({
            code: ApiErrors.IDENTIFIER_EXISTS,
        });
    });
});

describe("fetchSiteSettingsPropsForSSR", () => {
    it("wraps a successful read as { siteSettings }", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", seeded: true, siteTitle: "Acme" });
        const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
        const objectFactory = fakeObjectFactory(repoUtils);

        const result = await fetchSiteSettingsPropsForSSR(objectFactory, SiteSettingsSQL, null);

        expect(result.siteSettings.siteTitle).toBe("Acme");
    });

    it("falls back to safe defaults instead of throwing when the read fails", async () => {
        const objectFactory: any = { newInstance: vi.fn().mockRejectedValue(new Error("db down")) };

        const result = await fetchSiteSettingsPropsForSSR(objectFactory, SiteSettingsSQL, null);

        expect(result).toEqual({ siteSettings: { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false } });
    });
});

// The deployment's `site_settings` config seeds the row once (see getOrCreateSiteSettings()), the same way
// the messaging settings are seeded from smtp_config/sms_config/whatsapp — driven here against an in-memory fake of the
// repository, for both models, since every reader of the row goes through this one function.
function fakeRepo(initial?: Record<string, any>) {
    const state: { row?: Record<string, any> } = { row: initial };
    return {
        state,
        findOne: vi.fn(async () => state.row),
        create: vi.fn(async (obj: any) => (state.row = { ...obj, version: 0 })),
        update: vi.fn(async (obj: any) => (state.row = { ...obj })),
    };
}

const CONFIGURED = {
    siteTitle: "RapidMX",
    companyName: "RapidMX Inc",
    headerHtml: "<b>RapidMX</b>",
    footerHtml: "<i>Copyright</i>",
    logoUrl: "https://cdn.rapidmx.test/logo.svg",
    iconUrl: "/brand/icon.png",
    stylesheetUrl: "https://cdn.rapidmx.test/brand.css",
};

describe.each([
    ["SiteSettingsSQL", SiteSettingsSQL],
    ["SiteSettingsMongo", SiteSettingsMongo],
] as const)("getOrCreateSiteSettings() seeding from config (%s)", (_name, Model) => {
    it("creates the row with every configured field, marked seeded", async () => {
        const repo = fakeRepo();

        const row = await getOrCreateSiteSettings(repo as any, Model, CONFIGURED);

        expect(repo.create).toHaveBeenCalledWith({ uid: "default", seeded: true, ...CONFIGURED }, { ignoreACL: true });
        expect(row).toMatchObject({ seeded: true, ...CONFIGURED });
    });

    it("matches a configured key's name in any case, since an environment variable's is easy to get wrong", async () => {
        const repo = fakeRepo();

        await getOrCreateSiteSettings(repo as any, Model, { SITETITLE: "Loud", logourl: "/logo.png" });

        expect(repo.create).toHaveBeenCalledWith(
            { uid: "default", seeded: true, siteTitle: "Loud", logoUrl: "/logo.png" },
            { ignoreACL: true },
        );
    });

    it("creates the plain row, still marked seeded, when nothing is configured", async () => {
        for (const configured of [null, undefined, {}, { siteTitle: "" }]) {
            const repo = fakeRepo();

            await getOrCreateSiteSettings(repo as any, Model, configured);

            expect(repo.create).toHaveBeenCalledWith({ uid: "default", seeded: true }, { ignoreACL: true });
        }
    });

    it("ignores blank and invalid values without failing, still seeding the valid ones", async () => {
        const repo = fakeRepo();

        await getOrCreateSiteSettings(repo as any, Model, {
            siteTitle: "   ",
            companyName: 42,
            headerHtml: { html: "<b>x</b>" },
            footerHtml: "<i>ok</i>",
            logoUrl: "javascript:alert(1)",
            iconUrl: "//evil.example/icon.png",
            stylesheetUrl: "https://cdn.rapidmx.test/brand.css",
        });

        // (a number is fine for a title — an environment value such as "2024" is parsed into one — so `companyName` is kept)
        expect(repo.create).toHaveBeenCalledWith(
            {
                uid: "default",
                seeded: true,
                companyName: "42",
                footerHtml: "<i>ok</i>",
                stylesheetUrl: "https://cdn.rapidmx.test/brand.css",
            },
            { ignoreACL: true },
        );
    });

    it("never seeds an uploaded asset or a field it doesn't know, whatever config holds", async () => {
        const repo = fakeRepo();

        await getOrCreateSiteSettings(repo as any, Model, {
            siteTitle: "RapidMX",
            logoData: "AAAA",
            logoContentType: "image/png",
            stylesheetCss: "body{}",
            seeded: false,
            uid: "other",
            unknown: "x",
        });

        expect(repo.create).toHaveBeenCalledWith({ uid: "default", seeded: true, siteTitle: "RapidMX" }, { ignoreACL: true });
    });

    it("seeds nothing, without failing, from a config value that isn't an object", async () => {
        for (const configured of ["RapidMX", 7, true, ["siteTitle"]]) {
            const repo = fakeRepo();

            await getOrCreateSiteSettings(repo as any, Model, configured);

            expect(repo.create).toHaveBeenCalledWith({ uid: "default", seeded: true }, { ignoreACL: true });
        }
    });

    it("fills only the still-empty fields of a row saved before seeding existed, keeping the admin's values", async () => {
        const repo = fakeRepo({
            uid: "default",
            version: 3,
            siteTitle: "Admin's Title",
            companyName: null,
            headerHtml: "",
            logoData: "AAAA",
            logoContentType: "image/png",
        });

        const row = await getOrCreateSiteSettings(repo as any, Model, CONFIGURED);

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).toHaveBeenCalledTimes(1);
        const [written, previous, options] = repo.update.mock.calls[0] as any[];
        expect(written).toBeInstanceOf(Model);
        expect(previous).toMatchObject({ siteTitle: "Admin's Title", companyName: null });
        expect(options).toEqual({ ignoreACL: true });
        expect(row).toMatchObject({
            ...CONFIGURED,
            siteTitle: "Admin's Title",
            logoData: "AAAA",
            logoContentType: "image/png",
            seeded: true,
        });
    });

    it("marks a pre-seeding row seeded even when config has nothing to add", async () => {
        const repo = fakeRepo({ uid: "default", version: 0, siteTitle: "Admin's Title" });

        const row = await getOrCreateSiteSettings(repo as any, Model, null);

        expect(row).toMatchObject({ siteTitle: "Admin's Title", seeded: true });
    });

    it("never consults config once the row is seeded, so a field the admin cleared stays cleared", async () => {
        const repo = fakeRepo({ uid: "default", version: 1, seeded: true, siteTitle: null, companyName: "Admin Co" });

        const row = await getOrCreateSiteSettings(repo as any, Model, CONFIGURED);

        expect(repo.create).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
        expect(row).toMatchObject({ siteTitle: null, companyName: "Admin Co" });
        expect(row.headerHtml).toBeUndefined();
    });

    it("accepts the row another instance seeded at the same moment when it loses the race to create it", async () => {
        const winner = { uid: "default", version: 0, seeded: true, siteTitle: "RapidMX" };
        const repo = {
            findOne: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(winner),
            create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
            update: vi.fn(),
        };

        expect(await getOrCreateSiteSettings(repo as any, Model, CONFIGURED)).toBe(winner);
    });

    it("accepts the seeded row it finds when its own write of the seed fails at the same moment as another's", async () => {
        const winner = { uid: "default", version: 1, seeded: true, siteTitle: "RapidMX" };
        const repo = {
            findOne: vi.fn().mockResolvedValueOnce({ uid: "default", version: 0 }).mockResolvedValueOnce(winner),
            create: vi.fn(),
            update: vi.fn().mockRejectedValue(new Error("version conflict")),
        };

        expect(await getOrCreateSiteSettings(repo as any, Model, CONFIGURED)).toBe(winner);
    });

    it("throws the write's own error when the row still isn't seeded after a failed update", async () => {
        const repo = {
            findOne: vi.fn().mockResolvedValue({ uid: "default", version: 0 }),
            create: vi.fn(),
            update: vi.fn().mockRejectedValue(new Error("db down")),
        };

        await expect(getOrCreateSiteSettings(repo as any, Model, CONFIGURED)).rejects.toThrow("db down");
    });

    it("throws a create failure that isn't a collision, and a collision the re-read doesn't explain", async () => {
        await expect(
            getOrCreateSiteSettings(
                { findOne: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockRejectedValue(new Error("boom")) } as any,
                Model,
                CONFIGURED,
            ),
        ).rejects.toThrow("boom");
        await expect(
            getOrCreateSiteSettings(
                {
                    findOne: vi.fn().mockResolvedValue(undefined),
                    create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
                } as any,
                Model,
                CONFIGURED,
            ),
        ).rejects.toMatchObject({ code: ApiErrors.IDENTIFIER_EXISTS });
    });
});

describe("BaseSiteSettingsRoute with site_settings config", () => {
    function makeConfiguredRoute(repo: Record<string, any>, configured: unknown, logger?: any): TestSiteSettingsRoute {
        const route = makeRoute(repo);
        (route as any).configuredSiteSettings = configured;
        (route as any).logger = logger;
        return route;
    }

    it("serves the seeded values from GET, without ever exposing the seeded marker", async () => {
        const route = makeConfiguredRoute(fakeRepo(), CONFIGURED);

        const result = await route.getSettings();

        expect(result).toEqual({ ...CONFIGURED, logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        expect(result).not.toHaveProperty("seeded");
    });

    it("lets an admin change a seeded value, and clear another, and neither comes back from config", async () => {
        const repo = fakeRepo();
        const route = makeConfiguredRoute(repo, CONFIGURED);
        await route.getSettings();

        await route.updateSettings({ siteTitle: "Our Brand", footerHtml: null, logoUrl: null });
        const result = await route.getSettings();

        expect(result).toMatchObject({ siteTitle: "Our Brand", companyName: "RapidMX Inc" });
        expect(result.footerHtml).toBeUndefined();
        expect(result.logoUrl).toBeUndefined();
        expect(repo.state.row).toMatchObject({ seeded: true, footerHtml: null, logoUrl: null });
    });

    it("keeps the seeded marker through an admin's update", async () => {
        const repo = fakeRepo({ uid: "default", version: 0, seeded: true });
        const route = makeConfiguredRoute(repo, CONFIGURED);

        await route.updateSettings({ siteTitle: "Ours" });

        expect(repo.state.row).toMatchObject({ seeded: true, siteTitle: "Ours" });
        expect(repo.state.row?.companyName).toBeUndefined();
    });

    it("does not overwrite an admin's edit when config changes after the row was seeded", async () => {
        const repo = fakeRepo();
        await makeConfiguredRoute(repo, { siteTitle: "First" }).getSettings();
        await makeConfiguredRoute(repo, { siteTitle: "First" }).updateSettings({ siteTitle: "Admin's" });

        const result = await makeConfiguredRoute(repo, { siteTitle: "Second", companyName: "New Co" }).getSettings();

        expect(result.siteTitle).toBe("Admin's");
        expect(result.companyName).toBeUndefined();
    });

    it("resetSettings() picks up a config change made after the row was seeded, unlike getSettings()", async () => {
        const repo = fakeRepo();
        await makeConfiguredRoute(repo, CONFIGURED).getSettings();
        await makeConfiguredRoute(repo, CONFIGURED).updateSettings({ siteTitle: "Admin's", companyName: "Admin's Co" });

        const result = await makeConfiguredRoute(repo, { siteTitle: "RapidMX 2" }).resetSettings();

        expect(result.siteTitle).toBe("RapidMX 2");
        expect(result.companyName).toBeUndefined();
        expect(result.logoUrl).toBeUndefined();
    });

    describe("initialize()", () => {
        function makeStartingRoute(repo: Record<string, any>, configured: unknown, logger?: any): TestSiteSettingsRoute {
            const route = makeConfiguredRoute(repo, configured, logger);
            (route as any)._objectFactory = { newInstance: vi.fn() };
            return route;
        }

        it("seeds the row as the server starts, so the console shows it straight away", async () => {
            const repo = fakeRepo();

            await (makeStartingRoute(repo, CONFIGURED) as any).initialize();

            expect(repo.state.row).toMatchObject({ seeded: true, ...CONFIGURED });
        });

        it("says which configured values it's ignoring, and why", async () => {
            const logger = { warn: vi.fn() };

            await (
                makeStartingRoute(fakeRepo(), { logoUrl: "ftp://x", siteTitle: "Fine", logodata: "AAAA" }, logger) as any
            ).initialize();

            expect(logger.warn).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("site_settings.logoUrl must be an http(s) URL"));
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("site_settings.logodata is not a setting"));
        });

        it("must not stop the server when it can't seed yet, saying why: it's seeded on first use instead", async () => {
            const logger = { warn: vi.fn() };
            const repo = { findOne: vi.fn().mockRejectedValue(new Error("db not ready")), create: vi.fn(), update: vi.fn() };

            await (makeStartingRoute(repo, CONFIGURED, logger) as any).initialize();

            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unable to seed the site settings from config"));
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("db not ready"));
        });

        it("reports a failure that isn't an Error by its text, and copes with having no logger", async () => {
            const logger = { warn: vi.fn() };
            const repo = { findOne: vi.fn().mockRejectedValue("odd"), create: vi.fn(), update: vi.fn() };

            await (makeStartingRoute(repo, CONFIGURED, logger) as any).initialize();
            await (makeStartingRoute(repo, { logoUrl: "nope" }, undefined) as any).initialize();

            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("odd"));
        });
    });
});

describe("the site_settings config, through the readers that only have an ObjectFactory", () => {
    it("readPublicSiteSettings() seeds the row, when it's the first to read it, and returns the seeded values", async () => {
        const repo = fakeRepo();

        const result = await readPublicSiteSettings(fakeObjectFactory(repo), SiteSettingsSQL, CONFIGURED);

        expect(repo.create).toHaveBeenCalledWith({ uid: "default", seeded: true, ...CONFIGURED }, { ignoreACL: true });
        expect(result).toEqual({ ...CONFIGURED, logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        expect(result).not.toHaveProperty("seeded");
    });

    it("readPublicSiteSettings() then finds it seeded, so a route reading afterwards doesn't write again", async () => {
        const repo = fakeRepo();
        await readPublicSiteSettings(fakeObjectFactory(repo), SiteSettingsSQL, CONFIGURED);
        const route = makeRoute(repo);
        (route as any).configuredSiteSettings = { siteTitle: "Other" };

        const result = await route.getSettings();

        expect(result.siteTitle).toBe("RapidMX");
        expect(repo.create).toHaveBeenCalledTimes(1);
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("fetchSiteSettingsPropsForSSR() falls back to the config's valid values, not the stock branding, when the read fails", async () => {
        const objectFactory: any = { newInstance: vi.fn().mockRejectedValue(new Error("db down")) };

        const result = await fetchSiteSettingsPropsForSSR(objectFactory, SiteSettingsSQL, {
            siteTitle: "RapidMX",
            logoUrl: "javascript:alert(1)",
        });

        expect(result).toEqual({
            siteSettings: { siteTitle: "RapidMX", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false },
        });
    });
});
