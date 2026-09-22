///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/** The two color schemes `public/styles/globals.css` defines. */
export type Theme = "light" | "dark";

/** The `localStorage` key the visitor's explicit theme choice is remembered under. */
export const THEME_STORAGE_KEY = "rr-theme";

/**
 * A tiny script for each layout's `<head>` (see `apps/www/_layout.tsx`/`apps/admin/_layout.tsx`) that puts a
 * remembered choice on `<html data-theme>` before the first paint, so a visitor who picked the other scheme
 * than their OS prefers never sees a flash of the wrong one while the page hydrates. With nothing stored it
 * does nothing at all, and `globals.css` follows `prefers-color-scheme` on its own. Kept dependency-free and
 * wrapped in try/catch because it runs inline, ahead of everything else, where a thrown error (storage
 * blocked, say) must never stop the page.
 */
export const THEME_INIT_SCRIPT =
    `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

function isTheme(value: unknown): value is Theme {
    return value === "light" || value === "dark";
}

/** The theme the visitor explicitly chose, or `null` if they never did (or storage is unavailable/holds junk). */
export function getStoredTheme(): Theme | null {
    try {
        const value = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isTheme(value) ? value : null;
    } catch {
        // Storage blocked or absent (private window, SSR, ...): behave as if nothing was chosen.
        return null;
    }
}

/** Remembers an explicit choice. Best-effort: a failure just means it won't survive a reload. */
export function storeTheme(theme: Theme): void {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Storage blocked or full — the choice still applies to this page view.
    }
}

/** The scheme the operating system/browser prefers; `light` when that can't be determined (SSR, old browsers). */
export function getSystemTheme(): Theme {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
}

/** The theme currently in effect: the visitor's stored choice, else the system preference. */
export function resolveTheme(): Theme {
    return getStoredTheme() ?? getSystemTheme();
}

/** Applies a theme to the document by setting `<html data-theme>`, which `globals.css` layers over `prefers-color-scheme`. */
export function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
}
