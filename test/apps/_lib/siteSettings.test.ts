// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import {
    effectiveLogoUrl,
    effectiveStylesheetUrl,
    getSiteSettings,
    PublicSiteSettings,
    UPLOADED_LOGO_PATH,
    UPLOADED_STYLESHEET_PATH,
} from "../../../apps/shared/lib/siteSettings.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

const base: PublicSiteSettings = { logoUploaded: false, stylesheetUploaded: false };

describe("getSiteSettings", () => {
    it("fetches /settings", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, base));
        await getSiteSettings();
        expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.anything());
    });
});

describe("effectiveLogoUrl", () => {
    it("prefers the uploaded asset's serving path when a logo was uploaded", () => {
        const result = effectiveLogoUrl({ ...base, logoUploaded: true, logoUrl: "https://example.com/logo.png" });
        expect(result).toBe(UPLOADED_LOGO_PATH);
    });

    it("falls back to the configured reference URL when nothing was uploaded", () => {
        const result = effectiveLogoUrl({ ...base, logoUrl: "https://example.com/logo.png" });
        expect(result).toBe("https://example.com/logo.png");
    });

    it("returns undefined when neither is set", () => {
        expect(effectiveLogoUrl(base)).toBeUndefined();
    });
});

describe("effectiveStylesheetUrl", () => {
    it("prefers the uploaded asset's serving path when a stylesheet was uploaded", () => {
        const result = effectiveStylesheetUrl({
            ...base,
            stylesheetUploaded: true,
            stylesheetUrl: "https://example.com/style.css",
        });
        expect(result).toBe(UPLOADED_STYLESHEET_PATH);
    });

    it("falls back to the configured reference URL when nothing was uploaded", () => {
        const result = effectiveStylesheetUrl({ ...base, stylesheetUrl: "https://example.com/style.css" });
        expect(result).toBe("https://example.com/style.css");
    });

    it("returns undefined when neither is set", () => {
        expect(effectiveStylesheetUrl(base)).toBeUndefined();
    });
});
