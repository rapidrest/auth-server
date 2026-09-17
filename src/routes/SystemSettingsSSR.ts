///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectFactory } from "@rapidrest/service-core";
import { SystemSettingsUtils } from "@rapidrest/auth";
import { SystemSettingsMongo } from "@rapidrest/auth/mongo";
import { SystemSettingsSQL } from "@rapidrest/auth/sql";

/**
 * The subset of `@rapidrest/auth`'s `SystemSettings` safe to embed in a public page's SSR props. Deliberately
 * omits `requireMFA` — unlike `allowRegistration` (needed by `apps/www/auth/{signup,signin}` to render their
 * own chrome for an anonymous visitor), it's only ever meant for the admin console (`GET /api/settings`
 * already gates it server-side via `@RequiresScope`/trusted-role, same as `BaseSettingsRoute.get()`), and
 * nothing here re-derives that same access check for a plain page-props fetch.
 */
export interface PublicSystemSettings {
    allowRegistration: boolean;
}

const DEFAULT_PUBLIC_SYSTEM_SETTINGS: PublicSystemSettings = { allowRegistration: true };

/**
 * Reads the current `allowRegistration` value for embedding into `wwwRoute`/`AdminConsoleRoute`'s own
 * `fetchProps()` — see those classes for why this needs to happen in-process (SSR, no HTTP round-trip) and
 * `BaseSiteSettingsRoute.fetchSiteSettingsPropsForSSR()` for the identical pattern this mirrors for branding.
 * Never throws: falls back to `DEFAULT_PUBLIC_SYSTEM_SETTINGS` (registration open) so a settings-read failure
 * never breaks an entire page render.
 */
export async function fetchSystemSettingsPropsForSSR(
    objectFactory: ObjectFactory,
    db: "sql" | "mongo",
): Promise<{ systemSettings: PublicSystemSettings }> {
    try {
        const settingsClass = db === "sql" ? SystemSettingsSQL : SystemSettingsMongo;
        const settingsUtils: SystemSettingsUtils = await objectFactory.newInstance(SystemSettingsUtils, {
            name: settingsClass.name,
            args: [settingsClass],
        });
        const { allowRegistration } = await settingsUtils.get();
        return { systemSettings: { allowRegistration } };
    } catch {
        return { systemSettings: DEFAULT_PUBLIC_SYSTEM_SETTINGS };
    }
}
