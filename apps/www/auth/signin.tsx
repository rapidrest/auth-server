///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { AuthResult, clearImpersonatingMarker } from "../../shared/lib/api.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import { SystemSettings } from "../../shared/lib/systemSettings.js";
import AuthShell from "../../shared/components/layout/AuthShell.js";
import SignInFlow from "../../shared/components/sign-in/SignInFlow.js";

/**
 * Reads the return hand-off: `?return_to=` (what a downstream app sends) or the older `?returnTo=` (what
 * `/auth/authorize` sends). Either may be a same-origin path or an absolute URL — see `isSafeReturnTo()`
 * below for why neither is ever trusted as-is.
 */
export function readReturnTo(): string | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("return_to") || params.get("returnTo");
}

/**
 * Whether `value` is safe to assign to `window.location.href` after a sign-in. Two shapes qualify.
 *
 * A same-origin, relative path (starting with a single `/`). Rejects anything that could turn into an open
 * redirect to another host: a leading `//` (a protocol-relative URL — kept on the current scheme, but a
 * different host), and a leading `/\` (some browsers normalize a leading backslash to a second forward slash).
 *
 * An absolute http(s) URL whose origin is exactly one of `trustedOrigins` — the downstream apps this
 * deployment is configured for (its `cors.origins`; see `wwwRoute`'s `returnToOrigins`). The origin is
 * taken from the parsed URL, never from a prefix or substring of the raw text, so `https://good.com.evil.com`
 * and `https://good.com@evil.com` are judged by their real host (`evil.com`) and rejected.
 *
 * Anything else — a bare relative path, `javascript:`, an origin that isn't listed — is rejected.
 * Tab/newline/carriage-return characters are stripped first, matching the WHATWG URL parser's own
 * preprocessing — otherwise e.g. `"/\t/evil.com"` would pass a naive prefix check here but still be
 * parsed by the browser as `"//evil.com"` once assigned.
 */
export function isSafeReturnTo(value: string, trustedOrigins: readonly string[] = []): boolean {
    const stripped = value.replace(/[\t\r\n]/g, "");
    if (stripped.startsWith("/")) {
        return !stripped.startsWith("//") && !stripped.startsWith("/\\");
    }
    try {
        const url = new URL(stripped);
        return (url.protocol === "https:" || url.protocol === "http:") && trustedOrigins.includes(url.origin);
    } catch {
        return false;
    }
}

/**
 * `carriedReturnTo` is the value `SignInFlow` carried through an OAuth provider's redirect, for when the page's own
 * query string is gone — see `oauthState.ts`. The live query string wins if it has one. Either way it is checked
 * by `isSafeReturnTo()` before use: a callback URL is as forgeable as any other.
 */
function completeSignIn(result: AuthResult, trustedOrigins: readonly string[], carriedReturnTo?: string | null) {
    // A fresh, non-impersonated sign-in — clears any marker left over from a previous impersonated
    // session in this browser that was never explicitly stopped (see `isImpersonating()`'s doc comment).
    clearImpersonatingMarker();
    const returnTo = readReturnTo() || carriedReturnTo;
    // An account still on an administrator-issued temporary password goes to `/account` first, whose mandatory
    // dialog makes them pick a new one - wherever it was headed (a `return_to`, an `/auth/authorize` request) waits
    // until they've done that. The destination is carried along, still only if it's safe, and `/account` sends them
    // on to it once the password is changed.
    if (result.user?.passwordChangeRequired) {
        window.location.href =
            returnTo && isSafeReturnTo(returnTo, trustedOrigins)
                ? `/account?return_to=${encodeURIComponent(returnTo)}`
                : "/account";
        return;
    }
    window.location.href = returnTo && isSafeReturnTo(returnTo, trustedOrigins) ? returnTo : "/account";
}

interface SignInPageProps {
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    systemSettings?: SystemSettings;
    /**
     * The origins a `return_to` URL may point at besides this one. Populated automatically by the framework —
     * see `wwwRoute`'s `fetchProps()` override. Absent means only same-origin paths are honored.
     */
    returnToOrigins?: string[];
    /**
     * The built-in OAuth providers whose credentials this deployment has replaced from the shipped placeholders.
     * Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. Absent means every
     * provider's button is shown.
     */
    oauthProviders?: string[];
}

export default function SignInPage({
    siteSettings,
    systemSettings,
    returnToOrigins = [],
    oauthProviders,
}: SignInPageProps) {
    return (
        <AuthShell brand settings={siteSettings}>
            <SignInFlow
                onSuccess={(result, carriedReturnTo) => completeSignIn(result, returnToOrigins, carriedReturnTo)}
                returnTo={readReturnTo()}
                oauthProviders={oauthProviders}
            />
            {/* Hidden only on an explicit `false` — a server that doesn't report the setting keeps sign-up open. */}
            {systemSettings?.allowRegistration !== false && (
                <div className="rr-footer-link">
                    Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
                </div>
            )}
        </AuthShell>
    );
}
