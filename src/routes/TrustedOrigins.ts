///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

/**
 * Normalizes the configured `cors.origins` into the list of origins the sign-in page may send a user back to
 * via `?return_to=` (see `apps/www/auth/signin.tsx`'s `isSafeReturnTo()`).
 *
 * `cors.origins` is the operator's existing statement of which browser apps are downstream of this server,
 * so it doubles as the redirect allowlist rather than adding a second list to keep in sync. Every entry is
 * reduced to its bare origin (`scheme://host[:port]`, no path) so the page can compare it against a parsed
 * `URL.origin` exactly. Anything that isn't a well-formed http(s) origin is dropped — notably a `"*"`
 * wildcard, which is meaningful to CORS but must never mean "redirect anywhere".
 */
export function toTrustedOrigins(origins: unknown): string[] {
    const entries = typeof origins === "string" ? origins.split(",") : Array.isArray(origins) ? origins : [];
    const trusted = new Set<string>();
    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }
        try {
            const url = new URL(entry.trim());
            if (url.protocol === "https:" || url.protocol === "http:") {
                trusted.add(url.origin);
            }
        } catch {
            // Not a URL at all (e.g. "*") — never trusted.
        }
    }
    return [...trusted];
}
