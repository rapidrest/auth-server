///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect } from "react";
import { effectiveIconUrl, effectiveLogoUrl, PublicSiteSettings } from "../shared/lib/siteSettings.js";

interface HomePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function HomePage({ userUid, siteSettings }: HomePageProps) {
    const target = userUid ? "/account" : "/auth/signin";
    // Shown small, next to the site name, so the icon (if configured) takes precedence over the full
    // logo — same fallback chain as the admin nav header.
    const brandIcon =
        (siteSettings && (effectiveIconUrl(siteSettings) || effectiveLogoUrl(siteSettings))) || "/images/logo.svg";
    const brandTitle = siteSettings?.companyName || siteSettings?.siteTitle || "RapidREST";

    useEffect(() => {
        window.location.replace(target);
    }, [target]);

    return (
        <div className="rr-page">
            <noscript>
                <meta httpEquiv="refresh" content={`0;url=${target}`} />
            </noscript>
            <div className="rr-brand">
                <img src={brandIcon} width="36" height="36" alt="" />
                <span>{brandTitle}</span>
            </div>
        </div>
    );
}
