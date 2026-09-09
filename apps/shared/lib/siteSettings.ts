///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Public, unauthenticated read surface for this deployment's branding/customization (see
 * `SiteSettingsRoute`/`BaseSiteSettingsRoute` in `src/routes`) — used by both `apps/www` (including
 * anonymous visitors, e.g. on the sign-in page) and `apps/admin` to render their own chrome. Write
 * access (trusted-role-only) lives in `adminApi.ts` instead, alongside this app's other admin-only
 * operations.
 */
import { apiFetch } from "./api.js";

export interface PublicSiteSettings {
    siteTitle?: string;
    companyName?: string;
    headerHtml?: string;
    footerHtml?: string;
    /** The raw configured reference URL, if any — not resolved against an uploaded asset. */
    logoUrl?: string;
    /** `true` when a logo was uploaded directly; use `effectiveLogoUrl()` rather than `logoUrl` to render it. */
    logoUploaded: boolean;
    /** The raw configured reference URL, if any — not resolved against an uploaded asset. */
    stylesheetUrl?: string;
    /** `true` when a stylesheet was uploaded directly; use `effectiveStylesheetUrl()` rather than `stylesheetUrl` to render it. */
    stylesheetUploaded: boolean;
}

// These two are used directly as an <img src>/<link href> — unlike getSiteSettings()/adminApi.ts's
// calls, they never go through apiFetch(), so the "/api" prefix (which apiFetch() adds automatically)
// has to be included here explicitly.

/** The full URL `BaseSiteSettingsRoute.getLogo()` serves an uploaded logo from. */
export const UPLOADED_LOGO_PATH = "/api/settings/logo";

/** The full URL `BaseSiteSettingsRoute.getStylesheet()` serves an uploaded stylesheet from. */
export const UPLOADED_STYLESHEET_PATH = "/api/settings/stylesheet";

/** Fetches this deployment's branding settings. Public — safe to call without an authenticated session. */
export function getSiteSettings(): Promise<PublicSiteSettings> {
    return apiFetch("/settings");
}

/**
 * The logo `src` to actually render: the uploaded asset's serving endpoint when one was uploaded
 * (which always takes precedence — see `BaseSiteSettingsRoute`), otherwise the configured reference
 * URL, otherwise `undefined` (caller falls back to its own default).
 */
export function effectiveLogoUrl(settings: PublicSiteSettings): string | undefined {
    return settings.logoUploaded ? UPLOADED_LOGO_PATH : settings.logoUrl;
}

/** The stylesheet `href` to actually load — same uploaded-takes-precedence resolution as `effectiveLogoUrl()`. */
export function effectiveStylesheetUrl(settings: PublicSiteSettings): string | undefined {
    return settings.stylesheetUploaded ? UPLOADED_STYLESHEET_PATH : settings.stylesheetUrl;
}
