///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { clearImpersonatingMarker } from "../../shared/lib/api.js";
import AuthShell from "../../shared/components/layout/AuthShell.js";
import SignInFlow from "../../shared/components/sign-in/SignInFlow.js";

/** Reads the `?returnTo=` hand-off (e.g. from `/auth/authorize`) — see `isSafeReturnTo()` below for why this is never trusted as-is. */
export function readReturnTo(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("returnTo");
}

/**
 * Whether `value` is safe to assign directly to `window.location.href` as a same-origin, relative
 * navigation. Rejects anything that could turn into an open redirect to another host:
 * - doesn't start with `/` at all (an absolute URL, `javascript:`, etc.)
 * - starts with `//` — a protocol-relative URL (kept on the current scheme, but a different host)
 * - starts with `/\` — some browsers normalize a leading backslash to a second forward slash
 * Tab/newline/carriage-return characters are stripped first, matching the WHATWG URL parser's own
 * preprocessing — otherwise e.g. `"/\t/evil.com"` would pass a naive prefix check here but still be
 * parsed by the browser as `"//evil.com"` once assigned.
 */
export function isSafeReturnTo(value: string): boolean {
    const stripped = value.replace(/[\t\r\n]/g, "");
    return stripped.startsWith("/") && !stripped.startsWith("//") && !stripped.startsWith("/\\");
}

function completeSignIn() {
    // A fresh, non-impersonated sign-in — clears any marker left over from a previous impersonated
    // session in this browser that was never explicitly stopped (see `isImpersonating()`'s doc comment).
    clearImpersonatingMarker();
    const returnTo = readReturnTo();
    window.location.href = returnTo && isSafeReturnTo(returnTo) ? returnTo : "/account";
}

export default function SignInPage() {
    return (
        <AuthShell brand>
            <SignInFlow onSuccess={completeSignIn} />
            <div className="rr-footer-link">
                Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
            </div>
        </AuthShell>
    );
}
