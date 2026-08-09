import { useEffect } from "react";
import { refreshAccessToken } from "./api.js";

/** Comfortably inside the 1-hour access token lifetime (see `auth:options:expiresIn`). */
const REFRESH_INTERVAL_MS = 55 * 60 * 1000;

/**
 * Keeps an authenticated page's access token alive for as long as the underlying refresh token (2 weeks)
 * remains valid, without requiring the user to sign in again:
 *
 * - If `userUid` is unset (SSR didn't see a valid access-token cookie — e.g. the tab was left open past
 * the access token's 1-hour lifetime, or reopened after the browser was closed), attempts a single
 * silent refresh. On success, reloads the page so SSR re-evaluates with the new cookie; on failure
 * (the refresh token itself has expired, or there wasn't one), redirects to sign-in.
 * - If `userUid` is set, proactively refreshes on a recurring timer well before the access token expires,
 * so an open tab never hits the missing-cookie case above. Redirects to sign-in if a refresh ever fails.
 *
 * @param userUid The uid populated server-side from the current access-token cookie, or `undefined` if
 * the request arrived with none.
 */
export function useSessionRefresh(userUid?: string): void {
    useEffect(() => {
        if (!userUid) {
            let cancelled = false;
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

        const interval = window.setInterval(() => {
            refreshAccessToken().catch(() => window.location.replace("/auth/signin"));
        }, REFRESH_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [userUid]);
}
