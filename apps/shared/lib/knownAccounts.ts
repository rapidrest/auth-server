///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * A `localStorage`-backed cache of sign-in identifier -> account `uid`, populated on every successful
 * password sign-in from this browser. Exists to solve a bootstrap problem for client-side password hashing
 * (see `clientPasswordHash.ts`): hashing requires the account's `uid` to derive its salt, but
 * `signInWithPassword()` only ever has the identifier the visitor typed — `discoverAuthMethods()`
 * deliberately never returns `uid` (anti-enumeration) — so there is no way to hash on a browser's first-ever
 * sign-in to a given account. Caching the resolved `uid` here after a successful sign-in makes every later
 * sign-in from the same browser hashable; the first one transparently falls back to submitting plaintext,
 * exactly as an incapable client would (the server accepts either form).
 *
 * `uid` is not a secret — the server already returns it to any client that successfully authenticates — so
 * caching it here introduces no new exposure even though `localStorage` is unencrypted and persists across
 * sessions.
 */

const STORAGE_KEY = "rr_known_accounts";
const MAX_ENTRIES = 20;

function normalizeIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
}

function readAll(): Record<string, string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Looks up the `uid` a previous successful sign-in from this browser resolved `identifier` to, if any. */
export function getKnownUid(identifier: string): string | null {
    return readAll()[normalizeIdentifier(identifier)] ?? null;
}

/**
 * Remembers that `identifier` resolves to `uid`, for future sign-ins from this browser. Call right after
 * any successful password sign-in. Evicts the oldest entry once `MAX_ENTRIES` is exceeded, so a shared or
 * long-lived browser profile doesn't accumulate an unbounded number of identifiers.
 */
export function rememberKnownUid(identifier: string, uid: string): void {
    try {
        const all = readAll();
        const key = normalizeIdentifier(identifier);
        delete all[key];
        const keys = Object.keys(all);
        if (keys.length >= MAX_ENTRIES) {
            delete all[keys[0]];
        }
        all[key] = uid;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
        // Storage disabled/unavailable — this is a best-effort convenience cache; sign-in itself is unaffected.
    }
}
