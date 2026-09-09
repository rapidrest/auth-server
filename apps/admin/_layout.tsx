///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import ElevationHost from "../shared/components/elevation/ElevationHost.js";
import { useSiteSettings } from "../shared/lib/useSiteSettings.js";

export default function Layout({ children }: PropsWithChildren) {
    const settings = useSiteSettings();
    const title = settings?.siteTitle || settings?.companyName || "RapidREST";
    
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{title} | Admin Console</title>
                <link rel="icon" href="/favicon.ico" />
                <link rel="stylesheet" href="/styles/globals.css" />
            </head>
            <body>
                {children}
                <ElevationHost />
            </body>
        </html>
    );
}
