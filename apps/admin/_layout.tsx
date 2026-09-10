///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import ElevationHost from "../shared/components/elevation/ElevationHost.js";
import { CUSTOM_STYLESHEET_LINK_ID } from "../shared/lib/useSiteSettings.js";
import { effectiveIconUrl, effectiveLogoUrl, effectiveStylesheetUrl, PublicSiteSettings } from "../shared/lib/siteSettings.js";

export interface LayoutProps {
    /** See `apps/www/_layout.tsx`'s `LayoutProps` doc comment — identical mechanism, supplied by `AdminConsoleRoute`'s `fetchProps()` override. */
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
                <title>{`${title}: Admin Console`}</title>
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
