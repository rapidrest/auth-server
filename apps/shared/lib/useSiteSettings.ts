///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useEffect, useState } from "react";
import { effectiveStylesheetUrl, getSiteSettings, PublicSiteSettings } from "./siteSettings.js";

/** `id` of the `<link>` this hook injects into `document.head` for an uploaded/referenced custom stylesheet. */
const CUSTOM_STYLESHEET_LINK_ID = "rr-custom-stylesheet";

/**
 * Fetches this deployment's branding once on mount and applies the parts of it that can't be set via
 * page props alone: `document.title` and a dynamically injected `<link rel="stylesheet">` for a custom
 * stylesheet. `apps/*_layout.tsx` renders its `<title>`/`<link>` tags server-side before this hook ever
 * runs, and threading fetched data into it would mean changing `@rapidrest/react`'s `ReactRoute` (a
 * sibling package this project doesn't publish changes to) — so those two effects are applied
 * client-side once settings arrive instead. This means a brief flash of the default "RapidREST"
 * branding on first paint until hydration completes and this fetch resolves, same tradeoff every other
 * post-mount fetch in this app already makes (see `AdminShell`'s `getCurrentUser()`/`ensureElevated()`).
 *
 * Used by both `AuthShell` (apps/www) and `AdminShell` (apps/admin) so every page gets consistent
 * branding from one implementation.
 */
export function useSiteSettings(): PublicSiteSettings | null {
    const [settings, setSettings] = useState<PublicSiteSettings | null>(null);

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
