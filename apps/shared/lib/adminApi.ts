///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Admin-only API calls: managing any account (not just the caller's own), used exclusively by `apps/admin`.
 * Kept separate from `lib/api.ts` (the self-service surface every app uses) since none of this is reachable
 * — or meaningful — for a non-admin caller; the server independently enforces that on every call here via
 * the `admin` trusted role (see `BaseUserRoute`/`BaseAliasRoute`/`BaseSecretRoute`/`BaseProfileRoute`).
 */

import { Alias, AliasType, apiFetch, ApiRequestError, ApiUser, AuthResult, Profile } from "./api.js";

export interface AdminUser extends ApiUser {
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
    requireMFA?: boolean;
}

/**
 * Provisions a bare account (no identifier/credential yet — see `createUserAlias`/`createUserPasswordSecret`).
 * `POST /users` now returns a full `AuthResult` (it doubles as an alternate self-registration flow when
 * called anonymously) rather than the bare created `User` — the admin caller is already authenticated, so
 * the token/cookie half of that result is a no-op here; only the `user` is relevant.
 */
export async function createUser(input: CreateUserInput): Promise<AdminUser> {
    const result = await apiFetch<AuthResult>("/users", { method: "POST", body: JSON.stringify(input) });
    return result.user as AdminUser;
}

export interface UpdateUserInput {
    uid: string;
    /** Must be the `version` from the most recently fetched copy of this account (optimistic concurrency). */
    version: number;
    roles?: string[];
    scopes?: string[];
    verified?: boolean;
    requireMFA?: boolean;
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
 * Impersonates the given account: mints a non-elevated token for it (the same roles/scopes it would get
 * from a normal sign-in) and swaps the server's `jwt` session cookie to it, stashing the caller's own
 * token in a separate cookie to be restored later. The browser's next request — including the redirect
 * to `/account` right after this resolves — is therefore already authenticated as the target account; the
 * returned `AuthResult` itself doesn't need to be read.
 */
export function impersonateUser(userUid: string): Promise<AuthResult> {
    return apiFetch("/admin/impersonate", { method: "POST", body: JSON.stringify({ userUid }) });
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

/** Lists the identifiers (aliases) registered to any of the given accounts, e.g. for a table of users. */
export function listAliasesForUsers(userUids: string[]): Promise<Alias[]> {
    if (userUids.length === 0) {
        return Promise.resolve([]);
    }
    const filter = encodeURIComponent(`in(${userUids.join(",")})`);
    return apiFetch(`/aliases?userUid=${filter}&limit=1000`);
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

/**
 * Confirms the caller is both elevated *and* holds the `admin` trusted role before the admin console
 * becomes interactive. `AdminShell` awaits this on load, so the caller is immediately asked to re-confirm
 * their identity (or turned away outright) rather than only once they try a specific gated action.
 */
export function ensureElevated(): Promise<unknown> {
    return apiFetch("/admin/release-notes");
}

/**
 * A registered OAuth 2.0 / OpenID Connect client application. Mirrors `@rapidrest/auth`'s `Client`
 * interface. `clientSecret` is only ever present in the response to `createClient()`/
 * `regenerateClientSecret()` — the plaintext secret is shown exactly once and never persisted or
 * retrievable again after that (see `BaseOAuthClientRoute`'s own doc comments upstream).
 */
export interface AdminClient {
    uid: string;
    version: number;
    dateCreated: string;
    dateModified: string;
    clientId: string;
    clientType: "confidential" | "public";
    clientName: string;
    redirectUris: string[];
    grantTypes: string[];
    responseTypes: string[];
    scope: string;
    tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "private_key_jwt" | "none";
    requirePkce: boolean;
    ownerUid?: string;
    firstParty: boolean;
    disabled?: boolean;
    clientSecret?: string;
}

export interface ListClientsParams {
    page?: number;
    limit?: number;
}

const DEFAULT_CLIENT_PAGE_SIZE = 25;

/** Lists OAuth clients — every client for an admin caller, only the caller's own for a non-admin owner. */
export function listClients(params: ListClientsParams = {}): Promise<AdminClient[]> {
    const limit = params.limit ?? DEFAULT_CLIENT_PAGE_SIZE;
    return apiFetch(`/oauth/clients?limit=${limit}&page=${params.page ?? 0}`);
}

/** Fetches a single OAuth client by its record `uid` (not its `clientId`). */
export function getClient(uid: string): Promise<AdminClient> {
    return apiFetch(`/oauth/clients/${encodeURIComponent(uid)}`);
}

export interface CreateClientInput {
    clientName: string;
    clientType: "confidential" | "public";
    redirectUris: string[];
    grantTypes: string[];
    responseTypes: string[];
    scope: string;
    tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
    firstParty: boolean;
}

/**
 * Registers a new OAuth client. For a `confidential` client, the response's `clientSecret` is the
 * plaintext secret — display it once (see `RevealSecretModal`) and never fetch it again.
 */
export function createClient(input: CreateClientInput): Promise<AdminClient> {
    return apiFetch("/oauth/clients", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateClientInput {
    uid: string;
    /** Must be the `version` from the most recently fetched copy of this client (optimistic concurrency). */
    version: number;
    clientName?: string;
    redirectUris?: string[];
    grantTypes?: string[];
    responseTypes?: string[];
    scope?: string;
    tokenEndpointAuthMethod?: "client_secret_basic" | "client_secret_post" | "none";
    firstParty?: boolean;
    disabled?: boolean;
}

export function updateClient(input: UpdateClientInput): Promise<AdminClient> {
    return apiFetch(`/oauth/clients/${encodeURIComponent(input.uid)}`, { method: "PUT", body: JSON.stringify(input) });
}

/** Deletes an OAuth client. `purge` bypasses the soft-delete and permanently erases the record. */
export function deleteClient(uid: string, version: number, purge = false): Promise<void> {
    const query = `version=${version}${purge ? "&purge=true" : ""}`;
    return apiFetch(`/oauth/clients/${encodeURIComponent(uid)}?${query}`, { method: "DELETE" });
}

/**
 * Generates a new secret for a `confidential` client, invalidating the previous one. The returned
 * `clientSecret` is the new plaintext secret, shown once — same one-time-reveal contract as `createClient()`.
 */
export function regenerateClientSecret(uid: string): Promise<{ clientSecret: string }> {
    return apiFetch(`/oauth/clients/${encodeURIComponent(uid)}/regenerate-secret`, { method: "POST" });
}
