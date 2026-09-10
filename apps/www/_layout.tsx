///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import ElevationHost from "../shared/components/elevation/ElevationHost.js";
import { CUSTOM_STYLESHEET_LINK_ID } from "../shared/lib/useSiteSettings.js";
import { effectiveIconUrl, effectiveLogoUrl, effectiveStylesheetUrl, PublicSiteSettings } from "../shared/lib/siteSettings.js";

export interface LayoutProps {
    /**
     * Supplied by `wwwRoute`'s `fetchProps()` override (see `src/sql/routes/wwwRoute.ts`/
     * `src/mongo/routes/wwwRoute.ts`) — `@rapidrest/react` spreads the same merged page props onto this
     * layout as onto the page it wraps, so this renders correctly server-side on the very first byte
     * of the response: no client-side flash from stock "RapidREST" branding, and a crawler reading the
     * raw HTML sees the real branding too. `undefined` only on the framework's unwrapped `_500` fallback
     * path, which doesn't receive props at all — falling back to stock branding there is acceptable.
     */
    siteSettings?: PublicSiteSettings;
}

export default function Layout({ children, siteSettings }: PropsWithChildren<LayoutProps>) {
    const title = siteSettings?.companyName || siteSettings?.siteTitle || "RapidREST";
    const iconHref = (siteSettings && (effectiveIconUrl(siteSettings) || effectiveLogoUrl(siteSettings))) || "/favicon.ico";
    const stylesheetHref = siteSettings && effectiveStylesheetUrl(siteSettings);

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{title}</title>
                <link rel="icon" href={iconHref} />
                <link rel="stylesheet" href="/styles/globals.css" />
                {stylesheetHref && <link rel="stylesheet" href={stylesheetHref} id={CUSTOM_STYLESHEET_LINK_ID} />}
            </head>
            <body>
                {children}
                <ElevationHost />
            </body>
        </html>
    );
}
