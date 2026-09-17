///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import { getSiteSettings, PublicSiteSettings } from "../shared/lib/siteSettings.js";
import { getSystemSettings, SystemSettings } from "../shared/lib/systemSettings.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import BrandingCard from "../shared/components/admin/settings/BrandingCard.js";
import IconCard from "../shared/components/admin/settings/IconCard.js";
import ContentCard from "../shared/components/admin/settings/ContentCard.js";
import StylesheetCard from "../shared/components/admin/settings/StylesheetCard.js";
import RegistrationCard from "../shared/components/admin/settings/RegistrationCard.js";
import Alert from "../shared/components/feedback/Alert.js";

interface SettingsPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    systemSettings?: SystemSettings;
}

/**
 * Customization of the www/admin console's branding (logo, site title/company name, header/footer, and a
 * custom stylesheet — mounted at `/api/settings/branding`) plus the deployment's registration/MFA policy
 * (mounted separately at `/api/settings`, see `RegistrationCard`). Wrapped in `AdminShell` like every
 * other admin page, which already gates all children behind the `admin` trusted role (plus a fresh
 * elevation) via its own `ensureElevated()` check — this page needs no additional client-side role check
 * of its own, and by the time it's reachable the caller's session is already elevated, which is what both
 * routes' `@RequiresTrustedRole()`-gated writes actually require.
 */
export default function SiteSettingsPage({ userUid, siteSettings, systemSettings }: SettingsPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="settings">
            <SiteSettingsContent initialSystemSettings={systemSettings} />
        </AdminShell>
    );
}

function SiteSettingsContent({ initialSystemSettings }: { initialSystemSettings?: SystemSettings }) {
    const [settings, setSettings] = useState<PublicSiteSettings | null>(null);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(initialSystemSettings ?? null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getSiteSettings(), getSystemSettings()])
            .then(([site, system]) => {
                setSettings(site);
                setSystemSettings(system);
            })
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load these settings."))
            .finally(() => setLoaded(true));
    }, []);

    return (
        <>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.01em" }}>Site settings</h1>
                <p className="rr-hint">Customize the branding shown across the www and admin console, and who can register.</p>
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
            {/* Not gated on `loaded`: an SSR-injected `initialSystemSettings` lets this render on the very
                first paint, before the client-side re-fetch (which also covers the branding cards above,
                and so waits on the slower of the two) resolves. */}
            {systemSettings && <RegistrationCard settings={systemSettings} onUpdated={setSystemSettings} />}
        </>
    );
}
