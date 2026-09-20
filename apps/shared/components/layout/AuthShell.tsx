///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import { useSiteSettings } from "../../lib/useSiteSettings.js";
import { effectiveLogoUrl, PublicSiteSettings } from "../../lib/siteSettings.js";
import ElevationHost from "../elevation/ElevationHost.js";
import ImpersonationBanner from "../impersonation/ImpersonationBanner.js";

export interface AuthShellProps {
    /**
     * Shows the site logo above the content — alone when this deployment has configured one, or with the title
     * beside it when it hasn't, since the title is only there to stand in for a missing logo. Omit on pages that
     * don't want it (e.g. account). A page with this doesn't also render the custom header (`headerHtml`): the
     * brand block is its header, and the two would show the same logo twice.
     */
    brand?: boolean;
    /**
     * Renders the images in the custom header (its logo) twice as large. The header is operator-supplied HTML, so
     * this scales whatever size it gave them rather than setting one. Only has an effect where the header is shown.
     */
    largeHeaderLogo?: boolean;
    /** Widens the container for pages with more content (e.g. account, which has multiple cards/tables). */
    wide?: boolean;
    /**
     * The page's own `siteSettings` prop (server-injected — see `wwwRoute`'s `fetchProps()` override),
     * passed through so the very first render already reflects real branding, not just after this
     * component's own background refetch resolves — see `useSiteSettings()`'s doc comment.
     */
    settings?: PublicSiteSettings;
}

/**
 * The `.rr-page > .rr-container` chrome shared by every auth page. Also applies this deployment's
 * custom branding (logo/title, header/footer, stylesheet) via `useSiteSettings()`.
 */
export default function AuthShell({
    brand,
    largeHeaderLogo,
    wide,
    settings: initialSettings,
    children,
}: PropsWithChildren<AuthShellProps>) {
    const settings = useSiteSettings(initialSettings);
    const configuredLogo = settings && effectiveLogoUrl(settings);
    const logo = configuredLogo || "/images/logo.svg";
    const brandTitle = settings?.companyName || settings?.siteTitle || "RapidREST";

    return (
        <div className="rr-page">
            <div className={"rr-container" + (wide ? " rr-container--wide" : "")}>
                <ImpersonationBanner />
                {!brand && settings?.headerHtml && (
                    <div
                        className={"rr-custom-header" + (largeHeaderLogo ? " rr-custom-header--large-logo" : "")}
                        dangerouslySetInnerHTML={{ __html: settings.headerHtml }}
                    />
                )}
                {brand && (
                    <div className="rr-brand">
                        {/* With the title beside it the logo is decorative; on its own it has to carry the name. */}
                        <img src={logo} height="128" alt={configuredLogo ? brandTitle : ""} />
                        {!configuredLogo && <span>{brandTitle}</span>}
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
