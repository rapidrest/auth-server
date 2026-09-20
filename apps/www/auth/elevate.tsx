///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect } from "react";
import { requestElevation } from "../../shared/lib/elevation.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import { useSessionRefresh } from "../../shared/lib/useSessionRefresh.js";
import AuthShell from "../../shared/components/layout/AuthShell.js";
import { isSafeReturnTo, readReturnTo } from "./signin.js";

/** Where the visitor lands when there is nothing safe (or nothing wanted) to go back to. */
const FALLBACK_PATH = "/account";

/**
 * The sign-in URL for a visitor with no session, carrying this page's own address (its `return_to` included) as
 * *its* `return_to` — so once they've signed in they arrive back here, still holding the downstream app's
 * `return_to`, and the prompt opens. This page's own path is same-origin and relative, which `/auth/signin`
 * accepts without needing this origin in `cors.origins`.
 */
function signInUrl(): string {
    return `/auth/signin?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

interface ElevatePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
    /**
     * The origins a `return_to` URL may point at besides this one. Populated automatically by the framework —
     * see `wwwRoute`'s `fetchProps()` override. Absent means only same-origin paths are honored.
     */
    returnToOrigins?: string[];
}

/**
 * `/auth/elevate?return_to=<url>` — how a downstream app asks the signed-in user to obtain an *elevated* token
 * and then comes back with it. The app that got an `api-104` (elevation required) from its own API sends the
 * browser here; this page shows the same elevation prompt every other page raises (`ElevationHost`, via
 * `requestElevation()`), and the elevated token it results in is issued as a cookie, so once the browser
 * returns to `return_to` that app's requests carry it (on a cookie `Domain` shared with the downstream app — see
 * `auth.cookie.access.domain`).
 *
 * - No session: sent to `/auth/signin` (after one silent refresh attempt — see `useSessionRefresh()`), which
 * brings the visitor back here once they've signed in.
 * - Elevated: sent to `return_to` if `isSafeReturnTo()` accepts it (a same-origin path, or an absolute URL on one
 * of `returnToOrigins`), otherwise to `/account`. An unsafe `return_to` is never navigated to.
 * - Cancelled: sent to `/account`, deliberately *not* back to `return_to` — the app would only have sent the
 * visitor straight back here.
 */
export default function ElevatePage({ userUid, siteSettings, returnToOrigins = [] }: ElevatePageProps) {
    useSessionRefresh(userUid, signInUrl);

    useEffect(() => {
        if (!userUid) {
            return;
        }

        let cancelled = false;
        void requestElevation().then((elevated) => {
            if (cancelled) {
                return;
            }
            const returnTo = readReturnTo();
            window.location.href =
                elevated && returnTo && isSafeReturnTo(returnTo, returnToOrigins) ? returnTo : FALLBACK_PATH;
        });
        return () => {
            cancelled = true;
        };
        // `returnToOrigins` is fixed for the life of the page (server-injected props); it is read when the prompt
        // settles, and re-running this effect for it would raise a second prompt.
    }, [userUid]);

    return (
        <AuthShell brand settings={siteSettings}>
            <div className="rr-card" role="status">
                <div className="rr-card__title">Confirming it&rsquo;s you&hellip;</div>
                <div className="rr-card__subtitle">
                    {userUid ? "Complete the prompt to continue." : "Checking your session…"}
                </div>
            </div>
        </AuthShell>
    );
}
