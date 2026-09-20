///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * What `SignInFlow` round-trips through an OAuth provider's redirect, encoded in the OAuth `state` param — exactly
 * what `state` is for. `OIDCStrategy.buildAuthorizationURI` reads the `state` this client sends as the "client app
 * data" half, combines it with its own CSRF token as `<csrfToken>.<appData>`, and the provider hands the whole
 * thing back untouched on its own redirect — on the success and the `?error=` redirects alike, per RFC 6749
 * §4.1.2/§4.1.2.1. The CSRF half is a server-generated `base64url` value (alphabet `[A-Za-z0-9_-]`, RFC 4648 §5),
 * which by construction never contains a literal `.`, so splitting on the first `.` reliably recovers whatever
 * this client appended without having to validate the CSRF half itself — the backend independently re-checks that
 * against the session when the code is exchanged.
 *
 * The app data is `<provider>` alone, or `<provider>.<base64url(return_to)>` when the user arrived with a
 * `return_to`: the sign-in page's own query string is gone by the time the provider redirects back (a real
 * top-level navigation away and back), so this is the only place it can survive. Neither half can contain a `.`
 * itself (provider names are plain words; base64url has none), so the split is unambiguous.
 *
 * Nothing recovered from here is trusted: the URL a user is sent to after sign-in is still checked by
 * `isSafeReturnTo()` (see `apps/www/auth/signin.tsx`) exactly as if it had come straight from the query string,
 * because a callback URL is as forgeable as any other.
 */

/**
 * The longest base64url-encoded `return_to` that will be put in `state`. A provider rejects an over-long `state`
 * outright, which would break the whole sign-in — far worse than losing the redirect and landing on `/account`.
 */
const MAX_ENCODED_RETURN_TO_LENGTH = 1024;

function toBase64Url(text: string): string {
    let binary = "";
    for (const byte of new TextEncoder().encode(text)) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The inverse of `toBase64Url()`, or `null` for anything that isn't valid base64url-encoded UTF-8. */
function fromBase64Url(encoded: string): string | null {
    try {
        const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    } catch {
        return null;
    }
}

/**
 * The client-supplied `state` to send when starting a sign-in with `provider`. Just the provider name unless there
 * is a `returnTo` to carry, and just the provider name again if that `returnTo` is too long to fit safely.
 */
export function encodeOAuthState(provider: string, returnTo?: string | null): string {
    if (!returnTo) {
        return provider;
    }
    const encoded = toBase64Url(returnTo);
    return encoded.length > MAX_ENCODED_RETURN_TO_LENGTH ? provider : `${provider}.${encoded}`;
}

/**
 * Recovers what `encodeOAuthState()` put in from the combined `<csrfToken>.<appData>` value the provider handed
 * back. `provider` is `""` when there is nothing recoverable (the state was stripped or mangled in transit, or
 * the provider errored out before ever including one); `returnTo` is `null` when none was carried or it can't be
 * decoded.
 */
export function decodeOAuthState(state: string | null): { provider: string; returnTo: string | null } {
    const csrfEnd = state?.indexOf(".") ?? -1;
    if (!state || csrfEnd < 0) {
        return { provider: "", returnTo: null };
    }
    const appData = state.slice(csrfEnd + 1);
    const providerEnd = appData.indexOf(".");
    if (providerEnd < 0) {
        return { provider: appData, returnTo: null };
    }
    return { provider: appData.slice(0, providerEnd), returnTo: fromBase64Url(appData.slice(providerEnd + 1)) };
}
