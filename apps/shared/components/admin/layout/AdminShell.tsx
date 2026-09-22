///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren, ReactNode, useEffect, useState } from "react";
import { IconType } from "react-icons";
import { FiActivity, FiKey, FiMail, FiSettings, FiUsers } from "react-icons/fi";
import { Alias, AliasType, ApiRequestError, getProfile, listAliases, logout, Profile } from "../../../lib/api.js";
import { ensureElevated } from "../../../lib/adminApi.js";
import { useSessionRefresh } from "../../../lib/useSessionRefresh.js";
import { useSiteSettings } from "../../../lib/useSiteSettings.js";
import { effectiveIconUrl, effectiveLogoUrl, PublicSiteSettings } from "../../../lib/siteSettings.js";
import ElevationHost from "../../elevation/ElevationHost.js";
import ImpersonationBanner from "../../impersonation/ImpersonationBanner.js";
import Alert from "../../feedback/Alert.js";
import AvatarMenu from "./AvatarMenu.js";

/** The top-level console sections, each with its own sidebar entry. */
export type AdminSection = "users" | "oauth-clients" | "messages" | "audit-log" | "settings";

interface NavItem {
    section: AdminSection;
    label: string;
    href: string;
    icon: IconType;
}

const NAV_ITEMS: NavItem[] = [
    { section: "users", label: "Users", href: "/admin", icon: FiUsers },
    { section: "oauth-clients", label: "OAuth Clients", href: "/admin/oauth-clients", icon: FiKey },
    { section: "messages", label: "Messages", href: "/admin/messages", icon: FiMail },
    { section: "audit-log", label: "Audit Log", href: "/admin/audit-log", icon: FiActivity },
    { section: "settings", label: "Settings", href: "/admin/settings", icon: FiSettings },
];

/**
 * Username first (the identifier a user picked for themselves), then e-mail, then phone. `oauth` aliases
 * are opaque provider account ids, never worth showing as a name.
 */
const ALIAS_DISPLAY_PRIORITY: AliasType[] = ["name", "email", "phone"];

/**
 * The name shown for the signed-in admin in the top bar's account menu: their profile's given + family
 * name when either is set, otherwise their most human-readable login identifier (see
 * `ALIAS_DISPLAY_PRIORITY`), and only as a last resort their raw account uid.
 */
export function resolveDisplayName(uid: string, profile: Profile | null, aliases: Alias[]): string {
    const fullName = [profile?.givenName, profile?.familyName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    if (fullName) {
        return fullName;
    }
    for (const type of ALIAS_DISPLAY_PRIORITY) {
        const alias = aliases.find((a) => a.type === type);
        if (alias) {
            return alias.alias;
        }
    }
    return uid;
}

export interface AdminShellProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** The page's own `siteSettings` prop (server-injected — see `AdminConsoleRoute`'s `fetchProps()` override). */
    settings?: PublicSiteSettings;
    /**
     * Which sidebar entry to highlight, and the title shown in the top bar. Passed explicitly by each page
     * (rather than derived from `window.location`) so the server-rendered markup already matches.
     */
    section?: AdminSection;
}

type Status = "checking" | "denied" | "error" | "authorized";

/**
 * Gates every `apps/admin` page behind the `admin` trusted role *and* a fresh elevation, via
 * `ensureElevated()`, then frames it in the full-viewport console chrome: an icon sidebar down the left,
 * a top bar (section title + account menu) across the remaining width, and the page scrolling beneath it.
 */
export default function AdminShell({
    userUid,
    settings: initialSettings,
    section,
    children,
}: PropsWithChildren<AdminShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [aliases, setAliases] = useState<Alias[]>([]);
    const [error, setError] = useState<string | null>(null);
    const settings = useSiteSettings(initialSettings);
    const brandTitle = settings?.companyName || settings?.siteTitle || "RapidREST";
    // The compact sidebar mark: prefers a dedicated icon, falls back to the full logo, then to the default
    // asset.
    const brandIcon = (settings && (effectiveIconUrl(settings) || effectiveLogoUrl(settings))) || "/images/logo.svg";
    const activeItem = NAV_ITEMS.find((item) => item.section === section);

    // Keeps the access token alive (and this shell usable) for as long as the refresh token is valid —
    // see useSessionRefresh's doc comment. Handles redirecting to sign-in itself when no session can be
    // recovered, so the effect below no longer needs to.
    useSessionRefresh(userUid);

    useEffect(() => {
        if (!userUid) {
            return;
        }

        // Only feed the account menu's display name/avatar, so both are best-effort (e.g. an admin with no
        // Profile yet gets a 404) — resolveDisplayName() falls back all the way to the bare uid.
        getProfile()
            .then(setProfile)
            .catch(() => undefined);
        listAliases()
            .then(setAliases)
            .catch(() => undefined);

        // Blocks on the elevation prompt (via apiFetch/ElevationHost, triggered by the returned api-104 error
        // ensureElevated() gets back when not yet elevated) before the console renders as usable. If the error
        // returned is `api-103`, that means the caller was elevated but genuinely isn't a trusted user and
        // therefore cannot access the admin console.
        ensureElevated()
            .then(() => setStatus("authorized"))
            .catch((err) => {
                if (err instanceof ApiRequestError && err.code === "api-103") {
                    setStatus("denied");
                    return;
                }
                setError(err instanceof ApiRequestError ? err.message : "Could not verify administrator access.");
                setStatus("error");
            });
    }, [userUid]);

    async function handleSignOut() {
        // logout() never rejects (see its doc comment), and /auth/signin is a page rather than a backend
        // route, so there's no failure to handle before navigating.
        await logout();
        window.location.href = "/auth/signin";
    }

    let content: ReactNode;
    if (!userUid || status === "checking") {
        content = <div className="rr-page" />;
    } else if (status === "denied") {
        content = (
            <div className="rr-page">
                <div className="rr-container">
                    <ImpersonationBanner />
                    <Alert>You do not have administrator access.</Alert>
                    <p className="rr-hint">
                        <a href="/">Return home</a>
                    </p>
                </div>
            </div>
        );
    } else if (status === "error") {
        content = (
            <div className="rr-page">
                <div className="rr-container">
                    <ImpersonationBanner />
                    <Alert>{error}</Alert>
                </div>
            </div>
        );
    } else {
        content = (
            // The impersonation banner's in-flow spacer takes its height off the top of this full-viewport
            // column, so the fixed bar it pins never covers the sidebar or top bar.
            <div className="rr-admin-frame">
                <ImpersonationBanner />
                <div className="rr-admin">
                    <nav className="rr-admin-sidebar" aria-label="Admin console">
                        <a href="/admin" className="rr-admin-sidebar__brand" title={`${brandTitle} Admin`}>
                            <img src={brandIcon} alt={`${brandTitle} Admin`} />
                        </a>
                        {NAV_ITEMS.map(({ section: itemSection, label, href, icon: Icon }) => {
                            const active = itemSection === section;
                            const itemClass = active
                                ? "rr-admin-sidebar__item rr-admin-sidebar__item--active"
                                : "rr-admin-sidebar__item";
                            return (
                                <a
                                    key={itemSection}
                                    href={href}
                                    title={label}
                                    aria-label={label}
                                    aria-current={active ? "page" : undefined}
                                    className={itemClass}
                                >
                                    <Icon aria-hidden="true" />
                                </a>
                            );
                        })}
                    </nav>
                    <div className="rr-admin-body">
                        <header className="rr-admin-topbar">
                            <h1 className="rr-admin-topbar__title">
                                {activeItem ? activeItem.label : `${brandTitle} Admin`}
                            </h1>
                            <AvatarMenu
                                displayName={resolveDisplayName(userUid, profile, aliases)}
                                avatarUrl={profile?.avatar}
                                onSignOut={handleSignOut}
                                exitHref="/"
                            />
                        </header>
                        <main className="rr-admin-main">
                            <div className="rr-admin-content">
                                {/* No custom header (`headerHtml`) here: it's for the public pages, and the console
                                    already has its own brand mark and title in the sidebar and top bar. */}
                                {children}
                                {settings?.footerHtml && (
                                    <div
                                        className="rr-custom-footer"
                                        dangerouslySetInnerHTML={{ __html: settings.footerHtml }}
                                    />
                                )}
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {content}
            <ElevationHost />
        </>
    );
}
