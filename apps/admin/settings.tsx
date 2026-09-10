///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import { getSiteSettings, PublicSiteSettings } from "../shared/lib/siteSettings.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import BrandingCard from "../shared/components/admin/settings/BrandingCard.js";
import IconCard from "../shared/components/admin/settings/IconCard.js";
import ContentCard from "../shared/components/admin/settings/ContentCard.js";
import StylesheetCard from "../shared/components/admin/settings/StylesheetCard.js";
import Alert from "../shared/components/feedback/Alert.js";

interface SettingsPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

/**
 * Customization of the www/admin console's branding — logo, site title/company name, header/footer,
 * and a custom stylesheet. Wrapped in `AdminShell` like every other admin page, which already gates all
 * children behind the `admin` trusted role (plus a fresh elevation) via its own `ensureElevated()`
 * check — this page needs no additional client-side role check of its own, and by the time it's
 * reachable the caller's session is already elevated, which is what `BaseSiteSettingsRoute`'s
 * `@RequiresTrustedRole()`-gated writes actually require.
 */
export default function SiteSettingsPage({ userUid, siteSettings }: SettingsPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings}>
            <SiteSettingsContent />
        </AdminShell>
    );
}

function SiteSettingsContent() {
    const [settings, setSettings] = useState<PublicSiteSettings | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getSiteSettings()
            .then(setSettings)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load these settings."))
            .finally(() => setLoaded(true));
    }, []);

    return (
        <>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.01em" }}>Site settings</h1>
                <p className="rr-hint">Customize the branding shown across the www and admin console.</p>
            </div>

            {!loaded && <p className="rr-hint">Loading&hellip;</p>}
            {loaded && error && <Alert>{error}</Alert>}
            {loaded && settings && (
                <>
                    <BrandingCard settings={settings} onUpdated={setSettings} />
                    <IconCard settings={settings} onUpdated={setSettings} />
                    <ContentCard settings={settings} onUpdated={setSettings} />
                    <StylesheetCard settings={settings} onUpdated={setSettings} />
                </>
            )}
        </>
    );
}
