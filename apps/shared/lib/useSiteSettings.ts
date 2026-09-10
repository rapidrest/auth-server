///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useEffect, useState } from "react";
import { effectiveStylesheetUrl, getSiteSettings, PublicSiteSettings } from "./siteSettings.js";

/**
 * `id` of the `<link>` for an uploaded/referenced custom stylesheet — server-rendered directly by
 * `apps/*​/_layout.tsx` (with this exact id) when one is configured, and kept live by this hook's
 * background refresh thereafter (matched by this id, rather than always appending a duplicate).
 */
export const CUSTOM_STYLESHEET_LINK_ID = "rr-custom-stylesheet";

/**
 * Seeds from `initial` (the `siteSettings` prop every page now receives server-side — see
 * `wwwRoute`/`AdminConsoleRoute`'s `fetchProps()` overrides and `apps/*​/_layout.tsx`, which renders
 * `<title>`/`<link rel="icon">`/the custom stylesheet `<link>` directly from that same prop, so there's
 * no first-paint flash and a crawler sees real branding in the raw HTML) so the very first render
 * already reflects real branding, then re-fetches in the background and keeps `document.title`/the
 * custom stylesheet `<link>` live — e.g. if an admin changes branding while this tab is already open.
 * `document.title`/the stylesheet `<link>` aren't otherwise reachable from a page's own props the way
 * `_layout.tsx`'s tags are, so this hook (rather than the page) is still what applies them.
 *
 * Used by both `AuthShell` (apps/www) and `AdminShell` (apps/admin) so every page gets consistent
 * branding from one implementation.
 */
export function useSiteSettings(initial?: PublicSiteSettings | null): PublicSiteSettings | null {
    const [settings, setSettings] = useState<PublicSiteSettings | null>(initial ?? null);

    useEffect(() => {
        let cancelled = false;

        getSiteSettings()
            .then((result) => {
                if (cancelled) return;
                setSettings(result);

                document.title = result.companyName || result.siteTitle || "RapidREST";

                const href = effectiveStylesheetUrl(result);
                let link = document.getElementById(CUSTOM_STYLESHEET_LINK_ID) as HTMLLinkElement | null;
                if (href) {
                    if (!link) {
                        link = document.createElement("link");
                        link.id = CUSTOM_STYLESHEET_LINK_ID;
                        link.rel = "stylesheet";
                        document.head.appendChild(link);
                    }
                    link.href = href;
                } else if (link) {
                    link.remove();
                }
            })
            .catch(() => {
                // Best-effort branding — every consumer already renders sensible defaults when this
                // hook returns null, so a failed fetch (e.g. offline) just keeps those defaults.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return settings;
}
