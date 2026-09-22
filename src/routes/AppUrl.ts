///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/**
 * Normalizes the configured `app_url` — the downstream application a signed-in user is sent back to from
 * the "Return to App" button on `/account` (see `apps/shared/components/account/header/AccountHeader.tsx`).
 *
 * The value is rendered straight into an `href`, so only an absolute http(s) URL is accepted; anything else
 * (blank, not a string, a relative path, `javascript:`/`data:`/`ftp:` and the like, or not a URL at all) yields
 * an empty string, which the page treats as "no app configured" and hides the button. A valid value is
 * returned as the operator wrote it (trimmed), not re-serialized, so a path or query on it is kept verbatim.
 */
export function toAppUrl(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    const trimmed = value.trim();
    try {
        const url = new URL(trimmed);
        return url.protocol === "https:" || url.protocol === "http:" ? trimmed : "";
    } catch {
        // Not an absolute URL at all (e.g. "/app" or "mail.mydomain.com") — never used.
        return "";
    }
}
