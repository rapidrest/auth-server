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
import { BaseSiteSettingsRoute, fetchSiteSettingsPropsForSSR, readPublicSiteSettings } from "../src/routes/BaseSiteSettingsRoute.js";
import { SiteSettingsSQL } from "../src/models/sql/SiteSettingsSQL.js";

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
    });

    describe("getSettings / getOrCreate", () => {
        it("creates the default row (all fields unset) on first access", async () => {
            const repoUtils = {
                findOne: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockImplementation(async (obj) => new SiteSettingsSQL(obj)),
            };
            const route = makeRoute(repoUtils);

            const result = await route.getSettings();

            expect(repoUtils.create).toHaveBeenCalledWith({ uid: "default" }, { ignoreACL: true });
            expect(result).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
        });

        it("returns the existing row without creating one when it's already present", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Acme" });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing), create: vi.fn() };
            const route = makeRoute(repoUtils);

            const result = await route.getSettings();

            expect(repoUtils.create).not.toHaveBeenCalled();
            expect(result.siteTitle).toBe("Acme");
        });

        it("recovers from a concurrent-create race by re-fetching the now-existing row", async () => {
            const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Acme" });
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
            const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Old", companyName: "OldCo" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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

    describe("uploadLogo", () => {
        it("stores base64-encoded bytes and the normalized content type", async () => {
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default", logoData: "abc", logoContentType: "image/png" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default", iconData: "abc", iconContentType: "image/png" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default" });
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
            const existing = new SiteSettingsSQL({ uid: "default", stylesheetCss: "body {}" });
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
            const existing = new SiteSettingsSQL({ uid: "default", stylesheetCss: css });
            const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
            const route = makeRoute(repoUtils);
            const res = makeRes();

            await route.getStylesheet(res);

            expect(res.setHeader).toHaveBeenCalledWith("content-type", "text/css");
            const [sentBuffer] = res.end.mock.calls[0];
            expect(sentBuffer.toString("utf8")).toBe(css);
        });

        it("404s when no stylesheet has been uploaded", async () => {
            const existing = new SiteSettingsSQL({ uid: "default" });
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

        const result = await readPublicSiteSettings(objectFactory, SiteSettingsSQL);

        expect(objectFactory.newInstance).toHaveBeenCalledWith(expect.anything(), {
            name: SiteSettingsSQL.name,
            args: [SiteSettingsSQL],
        });
        expect(repoUtils.create).toHaveBeenCalledWith({ uid: "default" }, { ignoreACL: true });
        expect(result).toEqual({ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false });
    });

    it("returns the existing row without creating one when it's already present", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Acme" });
        const repoUtils = { findOne: vi.fn().mockResolvedValue(existing), create: vi.fn() };

        const result = await readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL);

        expect(repoUtils.create).not.toHaveBeenCalled();
        expect(result.siteTitle).toBe("Acme");
    });

    it("recovers from a concurrent-create race by re-fetching the now-existing row", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Acme" });
        const repoUtils = {
            findOne: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(existing),
            create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
        };

        const result = await readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL);

        expect(result.siteTitle).toBe("Acme");
    });

    it("re-throws a create failure that isn't a recoverable identifier collision", async () => {
        const repoUtils = {
            findOne: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockRejectedValue(new Error("boom")),
        };

        await expect(readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL)).rejects.toThrow("boom");
    });

    it("re-throws IDENTIFIER_EXISTS when the recovery re-fetch also comes back empty", async () => {
        const repoUtils = {
            findOne: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockRejectedValue(new ApiError(ApiErrors.IDENTIFIER_EXISTS, 400, "exists")),
        };

        await expect(readPublicSiteSettings(fakeObjectFactory(repoUtils), SiteSettingsSQL)).rejects.toMatchObject({
            code: ApiErrors.IDENTIFIER_EXISTS,
        });
    });
});

describe("fetchSiteSettingsPropsForSSR", () => {
    it("wraps a successful read as { siteSettings }", async () => {
        const existing = new SiteSettingsSQL({ uid: "default", siteTitle: "Acme" });
        const repoUtils = { findOne: vi.fn().mockResolvedValue(existing) };
        const objectFactory = fakeObjectFactory(repoUtils);

        const result = await fetchSiteSettingsPropsForSSR(objectFactory, SiteSettingsSQL);

        expect(result.siteSettings.siteTitle).toBe("Acme");
    });

    it("falls back to safe defaults instead of throwing when the read fails", async () => {
        const objectFactory: any = { newInstance: vi.fn().mockRejectedValue(new Error("db down")) };

        const result = await fetchSiteSettingsPropsForSSR(objectFactory, SiteSettingsSQL);

        expect(result).toEqual({ siteSettings: { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false } });
    });
});
