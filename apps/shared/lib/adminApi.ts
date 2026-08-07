/**
 * Admin-only API calls: managing any account (not just the caller's own), used exclusively by `apps/admin`.
 * Kept separate from `lib/api.ts` (the self-service surface every app uses) since none of this is reachable
 * — or meaningful — for a non-admin caller; the server independently enforces that on every call here via
 * the `admin` trusted role (see `BaseUserRoute`/`BaseAliasRoute`/`BaseSecretRoute`/`BaseProfileRoute`).
 */

import { Alias, AliasType, apiFetch, ApiRequestError, ApiUser, Profile } from "./api.js";

export interface AdminUser extends ApiUser {
    version: number;
    dateCreated: string;
    dateModified: string;
}

const DEFAULT_PAGE_SIZE = 25;

export interface ListUsersParams {
    page?: number;
    limit?: number;
    /** Field to sort ascending by. Defaults to `dateCreated`. */
    sort?: string;
    /** Filters to accounts holding this role. */
    role?: string;
    verified?: boolean;
    /** Substring match against `uid`. */
    uid?: string;
}

function buildUsersQuery(params: ListUsersParams): string {
    const parts: string[] = [
        `limit=${params.limit ?? DEFAULT_PAGE_SIZE}`,
        `page=${params.page ?? 0}`,
        `sort=${encodeURIComponent(params.sort ?? "dateCreated")}`,
    ];
    if (params.role) {
        parts.push(`roles=${encodeURIComponent(`in(${params.role})`)}`);
    }
    if (params.verified !== undefined) {
        parts.push(`verified=${encodeURIComponent(`eq(${params.verified})`)}`);
    }
    if (params.uid) {
        parts.push(`uid=${encodeURIComponent(`like(${params.uid})`)}`);
    }
    return parts.join("&");
}

/** Lists accounts. `results.length === (params.limit ?? 25)` is used by callers as the "has next page" signal. */
export function listUsers(params: ListUsersParams = {}): Promise<AdminUser[]> {
    return apiFetch(`/users?${buildUsersQuery(params)}`);
}

/** Fetches a single account by uid. */
export function getUser(uid: string): Promise<AdminUser> {
    return apiFetch(`/users/${encodeURIComponent(uid)}`);
}

export interface CreateUserInput {
    roles: string[];
    scopes: string[];
    verified: boolean;
}

/** Provisions a bare account (no identifier/credential yet — see `createUserAlias`/`createUserPasswordSecret`). */
export function createUser(input: CreateUserInput): Promise<AdminUser> {
    return apiFetch("/users", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateUserInput {
    uid: string;
    /** Must be the `version` from the most recently fetched copy of this account (optimistic concurrency). */
    version: number;
    roles?: string[];
    scopes?: string[];
    verified?: boolean;
}

export function updateUser(input: UpdateUserInput): Promise<AdminUser> {
    return apiFetch(`/users/${encodeURIComponent(input.uid)}`, { method: "PUT", body: JSON.stringify(input) });
}

/** Deletes an account. `purge` bypasses the soft-delete and permanently erases the record. */
export function deleteUser(uid: string, version: number, purge = false): Promise<void> {
    const query = `version=${version}${purge ? "&purge=true" : ""}`;
    return apiFetch(`/users/${encodeURIComponent(uid)}?${query}`, { method: "DELETE" });
}

/**
 * Finds accounts matching a free-text query: substring-matches `uid` directly, and separately resolves any
 * `Alias`es (email/phone/username) whose value contains the query, merging in the accounts they belong to.
 * Not paginated the same way `listUsers()` is — intended for a search box, not the main paged listing.
 */
export async function searchUsers(query: string, extra: ListUsersParams = {}): Promise<AdminUser[]> {
    const q = query.trim();
    if (!q) {
        return listUsers(extra);
    }

    const [byUid, matchingAliases] = await Promise.all([
        listUsers({ ...extra, uid: q }),
        apiFetch<Alias[]>(`/aliases?alias=${encodeURIComponent(`like(${q})`)}`),
    ]);

    const aliasUids = Array.from(new Set(matchingAliases.map((a) => a.userUid)));
    const byAliasResults = await Promise.all(
        aliasUids.map((uid) =>
            getUser(uid).catch((err) => {
                if (err instanceof ApiRequestError && err.status === 404) {
                    return null;
                }
                throw err;
            }),
        ),
    );

    const merged = new Map<string, AdminUser>();
    for (const user of [...byUid, ...byAliasResults]) {
        if (user) {
            merged.set(user.uid, user);
        }
    }
    return Array.from(merged.values());
}

/** Lists the identifiers (aliases) registered to the given account. */
export function listUserAliases(userUid: string): Promise<Alias[]> {
    return apiFetch(`/aliases?userUid=${encodeURIComponent(userUid)}`);
}

/**
 * Registers a new identifier for the given account. Note: per `BaseAliasRoute`, only `name` (username)
 * aliases are auto-verified on creation — an admin-added `email`/`phone` alias stays unverified until the
 * account holder verifies it themselves (there's no admin override for that).
 */
export function createUserAlias(userUid: string, type: AliasType, alias: string): Promise<Alias> {
    return apiFetch("/aliases", { method: "POST", body: JSON.stringify({ type, alias, userUid }) });
}

export interface AdminSecretSummary {
    uid: string;
    version: number;
    type: "password" | "totp" | "passkey" | "fido2";
    userUid: string;
    dateCreated: string;
    hint?: string;
}

/** Lists the sign-in methods (secrets) registered to the given account. */
export function listUserSecrets(userUid: string): Promise<AdminSecretSummary[]> {
    return apiFetch(`/secrets?userUid=${encodeURIComponent(userUid)}`);
}

/**
 * Sets a password credential for the given account on the admin's behalf (e.g. a temporary password for a
 * newly created or locked-out account). Unlike passkeys/security keys, a password doesn't require the
 * account holder's own device, so this is the one credential type an admin can provision directly.
 */
export function createUserPasswordSecret(userUid: string, password: string, hint?: string): Promise<AdminSecretSummary> {
    return apiFetch("/secrets", {
        method: "POST",
        body: JSON.stringify({ type: "password", data: password, userUid, ...(hint ? { hint } : {}) }),
    });
}

/** Fetches the given account's Profile, or `null` if it doesn't have one yet. */
export async function getUserProfile(uid: string): Promise<Profile | null> {
    try {
        return await apiFetch<Profile>(`/profiles/${encodeURIComponent(uid)}`);
    } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
            return null;
        }
        throw err;
    }
}

export interface UserProfileInput {
    givenName?: string;
    familyName?: string;
    birthdate?: string;
}

/** Creates or updates the given account's Profile, depending on whether `existing` was found by `getUserProfile()`. */
export function upsertUserProfile(uid: string, input: UserProfileInput, existing: Profile | null): Promise<Profile> {
    if (!existing) {
        return apiFetch("/profiles", { method: "POST", body: JSON.stringify({ uid, ...input }) });
    }
    return apiFetch(`/profiles/${encodeURIComponent(uid)}`, {
        method: "PUT",
        body: JSON.stringify({ uid, version: existing.version, ...input }),
    });
}
