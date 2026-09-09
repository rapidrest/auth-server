// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/siteSettings.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/siteSettings.js")>();
    return { ...actual, getSiteSettings: vi.fn() };
});

import { getSiteSettings, PublicSiteSettings, UPLOADED_STYLESHEET_PATH } from "../../../apps/shared/lib/siteSettings.js";
import { useSiteSettings } from "../../../apps/shared/lib/useSiteSettings.js";

const mockedGetSiteSettings = vi.mocked(getSiteSettings);
const CUSTOM_STYLESHEET_LINK_ID = "rr-custom-stylesheet";

afterEach(() => {
    mockedGetSiteSettings.mockReset();
    document.title = "";
    document.getElementById(CUSTOM_STYLESHEET_LINK_ID)?.remove();
});

const base: PublicSiteSettings = { logoUploaded: false, stylesheetUploaded: false };

describe("useSiteSettings", () => {
    it("fetches once and returns the settings", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({ ...base, siteTitle: "Acme" });

        const { result } = renderHook(() => useSiteSettings());

        expect(result.current).toBeNull();
        await waitFor(() => expect(result.current?.siteTitle).toBe("Acme"));
        expect(mockedGetSiteSettings).toHaveBeenCalledTimes(1);
    });

    it("sets document.title to companyName, falling back to siteTitle, falling back to RapidREST", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({ ...base, siteTitle: "Acme Auth", companyName: "Acme Inc" });

        renderHook(() => useSiteSettings());

        await waitFor(() => expect(document.title).toBe("Acme Inc"));
    });

    it("falls back to siteTitle when companyName is unset", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({ ...base, siteTitle: "Acme Auth" });

        renderHook(() => useSiteSettings());

        await waitFor(() => expect(document.title).toBe("Acme Auth"));
    });

    it("falls back to RapidREST when neither is set", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce(base);

        renderHook(() => useSiteSettings());

        await waitFor(() => expect(document.title).toBe("RapidREST"));
    });

    it("injects a custom stylesheet link when one is configured", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({ ...base, stylesheetUrl: "https://example.com/style.css" });

        renderHook(() => useSiteSettings());

        await waitFor(() => {
            const link = document.getElementById(CUSTOM_STYLESHEET_LINK_ID) as HTMLLinkElement | null;
            expect(link?.rel).toBe("stylesheet");
            expect(link?.href).toBe("https://example.com/style.css");
        });
    });

    it("prefers the uploaded stylesheet's serving path over a configured URL", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({
            ...base,
            stylesheetUploaded: true,
            stylesheetUrl: "https://example.com/style.css",
        });

        renderHook(() => useSiteSettings());

        await waitFor(() => {
            const link = document.getElementById(CUSTOM_STYLESHEET_LINK_ID) as HTMLLinkElement | null;
            expect(link?.href).toContain(UPLOADED_STYLESHEET_PATH);
        });
    });

    it("reuses an already-injected link tag rather than creating a second one", async () => {
        mockedGetSiteSettings.mockResolvedValueOnce({ ...base, stylesheetUrl: "https://example.com/style.css" });

        renderHook(() => useSiteSettings());

        await waitFor(() => expect(document.getElementById(CUSTOM_STYLESHEET_LINK_ID)).not.toBeNull());
        expect(document.querySelectorAll(`#${CUSTOM_STYLESHEET_LINK_ID}`).length).toBe(1);
    });

    it("removes a previously-injected link when no stylesheet is configured", async () => {
        const existing = document.createElement("link");
        existing.id = CUSTOM_STYLESHEET_LINK_ID;
        existing.rel = "stylesheet";
        existing.href = "https://example.com/stale.css";
        document.head.appendChild(existing);

        mockedGetSiteSettings.mockResolvedValueOnce(base);

        renderHook(() => useSiteSettings());

        await waitFor(() => expect(document.getElementById(CUSTOM_STYLESHEET_LINK_ID)).toBeNull());
    });

    it("keeps returning null and leaves defaults in place when the fetch fails", async () => {
        mockedGetSiteSettings.mockRejectedValueOnce(new Error("network down"));

        const { result } = renderHook(() => useSiteSettings());

        await waitFor(() => expect(mockedGetSiteSettings).toHaveBeenCalled());
        expect(result.current).toBeNull();
        expect(document.getElementById(CUSTOM_STYLESHEET_LINK_ID)).toBeNull();
    });

    it("does not act on a stale response after unmount", async () => {
        let resolveSettings: (value: PublicSiteSettings) => void = () => undefined;
        mockedGetSiteSettings.mockReturnValueOnce(new Promise((resolve) => (resolveSettings = resolve)));

        const { unmount } = renderHook(() => useSiteSettings());
        unmount();
        resolveSettings({ ...base, siteTitle: "Late" });

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.title).not.toBe("Late");
    });
});
