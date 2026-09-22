// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    applyTheme,
    getStoredTheme,
    getSystemTheme,
    resolveTheme,
    storeTheme,
    THEME_INIT_SCRIPT,
    THEME_STORAGE_KEY,
} from "../../../apps/shared/lib/theme.js";

/** Makes `window.matchMedia("(prefers-color-scheme: dark)")` report `dark`. */
function mockPrefersDark(dark: boolean): void {
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({ matches: dark && query === "(prefers-color-scheme: dark)" })),
    );
}

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getStoredTheme()", () => {
    it("returns null when nothing has been chosen", () => {
        expect(getStoredTheme()).toBeNull();
    });

    it("returns a stored light or dark choice", () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
        expect(getStoredTheme()).toBe("dark");
        window.localStorage.setItem(THEME_STORAGE_KEY, "light");
        expect(getStoredTheme()).toBe("light");
    });

    it("ignores a stored value that isn't a theme", () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, "solarized");
        expect(getStoredTheme()).toBeNull();
    });

    it("returns null when storage throws (blocked, private window)", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        expect(getStoredTheme()).toBeNull();
        vi.restoreAllMocks();
    });
});

describe("storeTheme()", () => {
    it("remembers the choice under rr-theme", () => {
        storeTheme("dark");
        expect(window.localStorage.getItem("rr-theme")).toBe("dark");
    });

    it("does not throw when storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        expect(() => storeTheme("light")).not.toThrow();
        vi.restoreAllMocks();
    });
});

describe("getSystemTheme()", () => {
    it("reflects the prefers-color-scheme media query", () => {
        mockPrefersDark(true);
        expect(getSystemTheme()).toBe("dark");
        mockPrefersDark(false);
        expect(getSystemTheme()).toBe("light");
    });

    it("falls back to light when matchMedia isn't available", () => {
        vi.stubGlobal("matchMedia", undefined);
        expect(getSystemTheme()).toBe("light");
    });

    it("falls back to light when there is no window at all (server-side)", () => {
        vi.stubGlobal("window", undefined);
        expect(getSystemTheme()).toBe("light");
    });
});

describe("resolveTheme()", () => {
    it("prefers the stored choice over the system preference", () => {
        mockPrefersDark(true);
        window.localStorage.setItem(THEME_STORAGE_KEY, "light");
        expect(resolveTheme()).toBe("light");
    });

    it("follows the system preference when nothing is stored", () => {
        mockPrefersDark(true);
        expect(resolveTheme()).toBe("dark");
    });
});

describe("applyTheme()", () => {
    it("sets data-theme on the document element", () => {
        applyTheme("dark");
        expect(document.documentElement.dataset.theme).toBe("dark");
        applyTheme("light");
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
});

describe("THEME_INIT_SCRIPT", () => {
    it("applies a stored choice to <html data-theme> when run", () => {
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
        new Function(THEME_INIT_SCRIPT)();
        expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("leaves data-theme alone when nothing valid is stored", () => {
        new Function(THEME_INIT_SCRIPT)();
        expect(document.documentElement.dataset.theme).toBeUndefined();

        window.localStorage.setItem(THEME_STORAGE_KEY, "solarized");
        new Function(THEME_INIT_SCRIPT)();
        expect(document.documentElement.dataset.theme).toBeUndefined();
    });

    it("never throws when storage is blocked", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
        vi.restoreAllMocks();
    });
});
