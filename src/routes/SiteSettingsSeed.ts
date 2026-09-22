///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/**
 * The branding fields the deployment's `site_settings` config can seed. Deliberately not the uploaded assets
 * (`logoData`, `iconData`, `stylesheetCss`): those are binary/bulk content that's uploaded in the admin console, and a
 * downstream app that wants its own logo, icon or stylesheet points at one with the URL fields.
 */
export const SITE_SETTINGS_SEED_FIELDS = [
    "siteTitle",
    "companyName",
    "headerHtml",
    "footerHtml",
    "logoUrl",
    "iconUrl",
    "stylesheetUrl",
] as const;

export type SiteSettingsSeedField = (typeof SITE_SETTINGS_SEED_FIELDS)[number];

/** How a field's config value is checked: free text, HTML, or a reference URL. */
type SeedKind = "text" | "html" | "url";

const FIELD_KINDS: Record<SiteSettingsSeedField, SeedKind> = {
    siteTitle: "text",
    companyName: "text",
    headerHtml: "html",
    footerHtml: "html",
    logoUrl: "url",
    iconUrl: "url",
    stylesheetUrl: "url",
};

/** Far more than a title, an address or a page of markup needs; it only bounds what's stored. */
const MAX_LENGTH: Record<SeedKind, number> = { text: 255, html: 100_000, url: 2048 };

/** The values the deployment's config would seed the row with, plus the config entries that were refused and why. */
export interface SiteSettingsSeed {
    /** Only the fields with a usable value: a blank or refused one is absent. */
    fields: Partial<Record<SiteSettingsSeedField, string>>;
    /** One human-readable line per config entry that was ignored, for the log. */
    rejected: string[];
}

/** Whether `value` is an `http(s)` URL, or a path on this server (`/logo.png`, not `//host` or `/\host`, which a browser reads as another host). */
function isReferenceUrl(value: string): boolean {
    // eslint-disable-next-line no-control-regex
    if (/[\s\u0000-\u001f\u007f]/.test(value)) {
        return false;
    }
    if (value.startsWith("/")) {
        return !/^\/[/\\]/.test(value) && !value.includes("\\");
    }
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
    } catch {
        return false;
    }
}

/** `raw` as the string it should be stored as, `undefined` when it's blank, or a reason it can't be used. */
function checkValue(field: SiteSettingsSeedField, raw: unknown): { value?: string; reason?: string } {
    const kind = FIELD_KINDS[field];
    if (raw === null || raw === undefined) {
        return {};
    }
    // Environment values are parsed (`parseValues`), so a title that is just "2024" arrives as a number.
    const value = typeof raw === "number" && kind === "text" && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof value !== "string") {
        return { reason: "must be a string" };
    }
    const trimmed = value.trim();
    if (trimmed === "") {
        return {};
    }
    if (trimmed.length > MAX_LENGTH[kind]) {
        return { reason: `is longer than ${MAX_LENGTH[kind]} characters` };
    }
    if (kind === "url" && !isReferenceUrl(trimmed)) {
        return { reason: "must be an http(s) URL or a path starting with a single /" };
    }
    return { value: trimmed };
}

/**
 * The values the deployment's `site_settings` config would seed the site settings row with. Config is
 * operator-provided but still checked, and a bad entry is skipped rather than failing anything: text and HTML must be
 * strings, a URL must be `http(s)` or a root-relative path, a blank value is the same as none, and a key that isn't a
 * seedable field (a typo, or an upload like `logoData`) is reported. Keys match case-insensitively, since an
 * environment variable's casing is easy to get wrong (`site_settings__siteTitle`, `site_settings__sitetitle`).
 *
 * Never throws, whatever `configured` is.
 */
export function siteSettingsSeedFromConfig(configured: unknown): SiteSettingsSeed {
    const seed: SiteSettingsSeed = { fields: {}, rejected: [] };
    if (configured === null || configured === undefined) {
        return seed;
    }
    if (typeof configured !== "object" || Array.isArray(configured)) {
        seed.rejected.push("site_settings must be an object of setting names to values");
        return seed;
    }

    const byName = new Map<string, SiteSettingsSeedField>(SITE_SETTINGS_SEED_FIELDS.map((f) => [f.toLowerCase(), f]));
    for (const [key, raw] of Object.entries(configured as Record<string, unknown>)) {
        const field = byName.get(key.toLowerCase());
        if (!field) {
            seed.rejected.push(
                `site_settings.${key} is not a setting that can be set from config (${SITE_SETTINGS_SEED_FIELDS.join(", ")})`,
            );
            continue;
        }
        const { value, reason } = checkValue(field, raw);
        if (reason) {
            seed.rejected.push(`site_settings.${field} ${reason}`);
        } else if (value !== undefined) {
            seed.fields[field] = value;
        }
    }
    return seed;
}
