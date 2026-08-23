import { useEffect } from "react";
import { ApiRequestError, refreshAccessToken } from "./api.js";

/** Comfortably inside the 1-hour access token lifetime (see `auth:options:expiresIn`). */
const REFRESH_INTERVAL_MS = 55 * 60 * 1000;
/** Backoff before retrying a refresh that failed for a reason other than an actual auth rejection. */
const RETRY_DELAY_MS = 30 * 1000;
/** Retries exhausted before the recurring-timer path gives up and redirects to sign-in. */
const MAX_TRANSIENT_RETRIES = 3;

/**
 * Whether `err` means the refresh/session itself was rejected (expired or invalid refresh token) as
 * opposed to some transient failure (a network blip, a 5xx) that's worth retrying instead of treating as
 * a sign that the user needs to re-authenticate.
 */
function isAuthRejection(err: unknown): boolean {
    return err instanceof ApiRequestError && (err.status === 401 || err.status === 403);
}

/**
 * Keeps an authenticated page's access token alive for as long as the underlying refresh token (2 weeks)
 * remains valid, without requiring the user to sign in again:
 *
 * - If `userUid` is unset (SSR didn't see a valid access-token cookie — e.g. the tab was left open past
 * the access token's 1-hour lifetime, or reopened after the browser was closed), attempts a single
 * silent refresh. On success, reloads the page so SSR re-evaluates with the new cookie; on failure
 * (the refresh token itself has expired, or there wasn't one), redirects to sign-in.
 * - If `userUid` is set, proactively refreshes on a recurring timer well before the access token expires,
 * so an open tab never hits the missing-cookie case above. An actual auth rejection (401/403 — the
 * refresh token has expired or was revoked) redirects to sign-in immediately; any other failure (e.g. the
 * user's connection dropped for a moment) is retried with a short backoff instead, so a flaky network
 * doesn't strand an otherwise-still-valid session.
 *
 * @param userUid The uid populated server-side from the current access-token cookie, or `undefined` if
 * the request arrived with none.
 */
export function useSessionRefresh(userUid?: string): void {
    useEffect(() => {
        let cancelled = false;

        if (!userUid) {
            refreshAccessToken()
                .then(() => {
                    if (!cancelled) window.location.reload();
                })
                .catch(() => {
                    if (!cancelled) window.location.replace("/auth/signin");
                });
            return () => {
                cancelled = true;
            };
        }

        let retriesLeft = MAX_TRANSIENT_RETRIES;
        let retryTimeout: number | undefined;

        const attemptRefresh = () => {
            refreshAccessToken()
                .then(() => {
                    retriesLeft = MAX_TRANSIENT_RETRIES;
                })
                .catch((err) => {
                    if (cancelled) return;
                    if (isAuthRejection(err) || retriesLeft <= 0) {
                        window.location.replace("/auth/signin");
                        return;
                    }
                    retriesLeft -= 1;
                    retryTimeout = window.setTimeout(attemptRefresh, RETRY_DELAY_MS);
                });
        };

        const interval = window.setInterval(attemptRefresh, REFRESH_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            if (retryTimeout !== undefined) window.clearTimeout(retryTimeout);
        };
    }, [userUid]);
}
