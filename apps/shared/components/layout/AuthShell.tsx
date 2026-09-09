///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import { useSiteSettings } from "../../lib/useSiteSettings.js";
import { effectiveLogoUrl } from "../../lib/siteSettings.js";
import ElevationHost from "../elevation/ElevationHost.js";
import ImpersonationBanner from "../impersonation/ImpersonationBanner.js";

export interface AuthShellProps {
    /** Shows the site logo + wordmark above the content. Omit on pages that don't want it (e.g. account). */
    brand?: boolean;
    /** Widens the container for pages with more content (e.g. account, which has multiple cards/tables). */
    wide?: boolean;
}

/**
 * The `.rr-page > .rr-container` chrome shared by every auth page. Also applies this deployment's
 * custom branding (logo/title, header/footer, stylesheet) via `useSiteSettings()` — see that hook's
 * doc comment for why the title/stylesheet are applied via effect rather than SSR props.
 */
export default function AuthShell({ brand, wide, children }: PropsWithChildren<AuthShellProps>) {
    const settings = useSiteSettings();
    const logo = (settings && effectiveLogoUrl(settings)) || "/images/logo.svg";
    const brandTitle = settings?.companyName || settings?.siteTitle || "RapidREST";

    return (
        <div className="rr-page">
            <div className={"rr-container" + (wide ? " rr-container--wide" : "")}>
                <ImpersonationBanner />
                {settings?.headerHtml && (
                    <div className="rr-custom-header" dangerouslySetInnerHTML={{ __html: settings.headerHtml }} />
                )}
                {brand && (
                    <div className="rr-brand">
                        <img src={logo} height="128" alt="" />
                        <span>{brandTitle}</span>
                    </div>
                )}
                {children}
                {settings?.footerHtml && (
                    <div className="rr-custom-footer" dangerouslySetInnerHTML={{ __html: settings.footerHtml }} />
                )}
            </div>
            <ElevationHost />
        </div>
    );
}
