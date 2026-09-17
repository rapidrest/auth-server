///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Deployment-wide authentication policy (see `@rapidrest/auth`'s `BaseSettingsRoute`/`SystemSettings`),
 * mounted at `/api/settings` — separate from the branding settings in `siteSettings.ts`/`adminApi.ts`'s
 * `*SiteSettings` functions (mounted at `/api/settings/branding`). Reading is public and unauthenticated
 * (both `apps/www` and `apps/admin` need `allowRegistration` to render their own chrome); writing is
 * trusted-role-only, same as branding.
 */
import { apiFetch } from "./api.js";

export interface SystemSettings {
    /**
     * Whether new accounts can currently be created by anyone other than an admin (self-service sign-up,
     * the public user-creation API, or a first-time OAuth sign-in). Treat `undefined` (e.g. an older
     * server that doesn't report it) as allowed.
     */
    allowRegistration?: boolean;
    /**
     * Whether every account is currently required to have multi-factor authentication enabled. Omitted
     * entirely for a caller without the admin trusted role (or the `system` token scope) — see
     * `BaseSettingsRoute.get()` — so its absence here does not mean the mandate is off, only that this
     * caller isn't allowed to see it.
     */
    requireMFA?: boolean;
}

/** Fetches the current registration/MFA policy. Public — safe to call without an authenticated session. */
export function getSystemSettings(): Promise<SystemSettings> {
    return apiFetch("/settings");
}

export interface UpdateSystemSettingsInput {
    /** Omit to leave untouched. Unlike branding settings, `null` is rejected — see `SystemSettings`'s own doc comment. */
    allowRegistration?: boolean;
    requireMFA?: boolean;
}

/** Trusted-role-only. Partially updates the registration/MFA policy. */
export function updateSystemSettings(input: UpdateSystemSettingsInput): Promise<SystemSettings> {
    return apiFetch("/settings", { method: "PUT", body: JSON.stringify(input) });
}
