/**
 * Minimal client-side helpers shared by the auth pages: a `fetch` wrapper that talks to the same-origin
 * RapidREST API and attaches the JWT, plus small helpers for storing/clearing that token. There is no
 * client router or HTTP client shipped by `@rapidrest/react`, so this is deliberately small and framework-free.
 */

const TOKEN_STORAGE_KEY = "rrst.jwt";

export interface ApiUser {
    uid: string;
    roles: string[];
    scopes: string[];
    verified?: boolean;
}

export interface AuthResult {
    token: string;
    user: ApiUser;
}

export class ApiRequestError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = "ApiRequestError";
        this.status = status;
        this.code = code;
    }
}

/** Reads the stored JWT, if any. Client-side only. */
export function getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Persists the JWT for subsequent client-side `fetch()` calls (localStorage). SSR page renders (e.g.
 * navigating to `/`) are authenticated separately, via the `jwt` HttpOnly cookie the server itself sets
 * (`Set-Cookie`, see `auth:cookie` config / `TokenUtils`) on the same response this token came from — the
 * browser stores that automatically, nothing to do here for it.
 */
export function setAuthToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
        // Ignore storage failures (e.g. private browsing quota) — the HttpOnly cookie still works for SSR.
    }
}

/**
 * Clears the locally-stored JWT. Does NOT clear the server-set `jwt` cookie — being `HttpOnly`, that
 * cookie isn't visible to (or clearable by) JavaScript at all. Call `logout()` instead of this directly
 * when signing a user out, so the cookie is cleared too via `POST /auth/logout`.
 */
export function clearAuthToken(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        // Ignore.
    }
}

/**
 * Signs the current user out: clears the server-set `jwt` cookie (an `HttpOnly` cookie can only be
 * cleared by the server writing a new `Set-Cookie`, never by client JavaScript) and the locally-stored
 * token. Safe to call even if the caller was never issued a cookie (e.g. cookie issuance is disabled
 * server-side) — `POST /auth/logout` always succeeds.
 */
export async function logout(): Promise<void> {
    try {
        await apiFetch("/auth/logout", { method: "POST" });
    } catch {
        // Still clear local state even if the network call failed — don't leave the user stuck signed in
        // on this device just because the logout request didn't reach the server.
    }
    clearAuthToken();
}

/**
 * `fetch()` against the same-origin API, attaching the stored JWT and decoding RapidREST-shaped errors.
 * `path` is the route as declared by `@ApiRoute` (e.g. `/register/start`) — the `/api` prefix that
 * decorator always adds is applied here, in one place, rather than repeated at every call site.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getAuthToken();
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    // Only fall back to the stored Bearer token if the caller didn't already set their own Authorization
    // header (e.g. password sign-in's `Basic <credentials>`, sent before any token exists anyway).
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`/api${path}`, { ...init, headers });
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
        const message = (body && (body.message || body.error)) || res.statusText || "Request failed.";
        throw new ApiRequestError(message, res.status, body?.code);
    }

    return body as T;
}

export type RegistrationIdentifierType = "email" | "phone";

function identifierBody(type: RegistrationIdentifierType, identifier: string): { email: string } | { phone: string } {
    return type === "email" ? { email: identifier } : { phone: identifier };
}

/** Sends a one-time verification code to the given e-mail address or phone number. No account exists yet. */
export function beginRegistration(type: RegistrationIdentifierType, identifier: string): Promise<Record<string, never>> {
    return apiFetch("/register/start", { method: "POST", body: JSON.stringify(identifierBody(type, identifier)) });
}

/**
 * Verifies the one-time code sent by `beginRegistration()`. On success, the account (User + verified Alias)
 * is created immediately and an `AuthResult` is returned — profile details and a password, if any, are
 * created afterward as separate authenticated calls (`createProfile`/`createPasswordSecret`), not as part
 * of this step.
 */
export function verifyRegistration(
    type: RegistrationIdentifierType,
    identifier: string,
    token: string,
): Promise<AuthResult> {
    return apiFetch("/register/verify", {
        method: "POST",
        body: JSON.stringify({ ...identifierBody(type, identifier), token }),
    });
}

export interface Contact {
    contact: string;
    type: RegistrationIdentifierType;
    verified: boolean;
}

export interface CreateProfileInput {
    givenName?: string;
    familyName?: string;
    birthdate?: string;
    contacts?: Contact[];
}

/** Creates the authenticated caller's own `Profile` (its `uid` is defaulted server-side to the caller's uid). */
export function createProfile(input: CreateProfileInput): Promise<unknown> {
    return apiFetch("/profiles", { method: "POST", body: JSON.stringify(input) });
}

export interface Profile {
    uid: string;
    version: number;
    givenName?: string;
    familyName?: string;
    birthdate?: string;
    contacts?: Contact[];
}

/** Fetches the authenticated caller's own `Profile`. Rejects with a 404 `ApiRequestError` if none exists yet. */
export function getProfile(): Promise<Profile> {
    return apiFetch("/profiles/me");
}

export interface UpdateProfileInput {
    uid: string;
    version: number;
    givenName?: string;
    familyName?: string;
    birthdate?: string;
    /**
     * When present, REPLACES the entire `contacts` array server-side (not merged element-wise) — always
     * pass the full desired array, not just the entries being added/changed. Adding a genuinely new,
     * unverified contact this way automatically triggers a one-time verification code to be sent to it.
     */
    contacts?: Contact[];
}

/** Updates the authenticated caller's own `Profile`. `version` must be the value from the last `getProfile()`. */
export function updateProfile(input: UpdateProfileInput): Promise<Profile> {
    return apiFetch("/profiles/me", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Verifies a pending contact using the one-time code that was sent automatically when it was added (see
 * `updateProfile`/`createProfile`) or resent (see `resendContactVerificationCode`). Flips that contact's
 * `verified` flag to `true` on success.
 */
export function verifyContact(contact: string, token: string): Promise<Profile> {
    return apiFetch("/profiles/me/contacts/verify", { method: "POST", body: JSON.stringify({ contact, token }) });
}

/** Requests a fresh verification code for a pending contact (e.g. the original expired or never arrived). */
export function resendContactVerificationCode(contact: string): Promise<void> {
    return apiFetch(`/profiles/me/contacts/sendCode?contact=${encodeURIComponent(contact)}`);
}

/**
 * Registers a password credential for the authenticated caller. The server hashes `password` (argon2) and
 * enforces the configured strength rules — `userUid` is defaulted server-side to the caller's own uid.
 */
export function createPasswordSecret(password: string): Promise<unknown> {
    return apiFetch("/secrets", { method: "POST", body: JSON.stringify({ type: "password", data: password }) });
}

/** Mirrors `@rapidrest/auth`'s `PasswordConfig` — the shape returned by `GET /secrets/password`. */
export interface PasswordRequirements {
    min_length: number;
    recommended_length: number;
    require_lowercase: boolean;
    require_uppercase: boolean;
    require_numeral: boolean;
    require_special: boolean;
    special_chars: string;
}

/** Fetches the server's configured password strength requirements. Anonymous — no account needed yet. */
export function getPasswordRequirements(): Promise<PasswordRequirements> {
    return apiFetch("/secrets/password");
}

function toBase64(value: string): string {
    // btoa() only accepts Latin1 — encode as UTF-8 bytes first so non-ASCII passwords survive.
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return window.btoa(binary);
}

/**
 * Signs in with an account identifier (email, phone, or username) and password. `BasicStrategy` is only
 * registered as `GET /auth/password`, and `fetch()` refuses a body on a GET request, so credentials go in
 * an `Authorization: Basic` header instead — the same way `curl -u` or a browser's native basic-auth
 * prompt would send them.
 */
export function signInWithPassword(id: string, password: string): Promise<AuthResult> {
    return apiFetch("/auth/password", {
        method: "GET",
        headers: { Authorization: `Basic ${toBase64(`${id}:${password}`)}` },
    });
}

/** Signs in with a 6-digit code from an authenticator app (RFC 6238 TOTP), for a previously registered secret. */
export function signInWithTotp(id: string, token: string): Promise<AuthResult> {
    return apiFetch("/auth/totp", { method: "POST", body: JSON.stringify({ id, token }) });
}

/**
 * Begins a passkey sign-in ceremony: returns a WebAuthn `PublicKeyCredentialRequestOptionsJSON` to pass
 * directly to `@simplewebauthn/browser`'s `startAuthentication({ optionsJSON })`. Pass `uid` to scope the
 * challenge to a known account's registered credentials (username-first flow); omit it for a discoverable,
 * "usernameless" flow.
 */
export function getPasskeyChallenge(uid?: string): Promise<unknown> {
    return apiFetch(`/auth/passkey${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`);
}

/** Finishes a passkey sign-in ceremony with the `AuthenticationResponseJSON` from `startAuthentication()`. */
export function verifyPasskeySignIn(response: unknown): Promise<AuthResult> {
    return apiFetch("/auth/passkey", { method: "POST", body: JSON.stringify(response) });
}

/**
 * Begins a FIDO2 security key sign-in ceremony. Distinct from `getPasskeyChallenge()` only in which
 * `Secret`s it's scoped against server-side (`fido2` vs `passkey`, registered with `authenticatorAttachment:
 * "cross-platform"`) — the WebAuthn request/response shapes are identical.
 */
export function getFido2Challenge(uid?: string): Promise<unknown> {
    return apiFetch(`/auth/fido2${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`);
}

/** Finishes a FIDO2 sign-in ceremony with the `AuthenticationResponseJSON` from `startAuthentication()`. */
export function verifyFido2SignIn(response: unknown): Promise<AuthResult> {
    return apiFetch("/auth/fido2", { method: "POST", body: JSON.stringify(response) });
}

/** A hint about one of an account's OTP-eligible contacts — obfuscated, never the real value. */
export interface DiscoveredOtpContact {
    contact: string;
    type: RegistrationIdentifierType;
}

/** The set of sign-in methods available for a claimed account identifier. */
export interface DiscoverResult {
    password: boolean;
    totp: boolean;
    passkey: boolean;
    fido2: boolean;
    /** Hints only — signing in via OTP still requires the caller to type the real contact themselves. */
    otp: DiscoveredOtpContact[];
}

/**
 * Discovers which sign-in methods are available for a claimed account identifier (e-mail, phone, or
 * username), so the sign-in page can present only the methods that will actually work. Anonymous — no
 * account needed. Always returns the same response shape whether or not the identifier resolves to a real
 * account (anti-enumeration), so a "nothing available" result should be treated as a generic failure, not
 * as proof the account doesn't exist.
 */
export function discoverAuthMethods(id: string): Promise<DiscoverResult> {
    return apiFetch(`/auth/discover?id=${encodeURIComponent(id)}`);
}

/**
 * Begins an OTP sign-in ceremony: sends a one-time code to `contact` (which must be the real, exact
 * contact value the caller types in — `discoverAuthMethods()`'s hints are obfuscated and intentionally not
 * enough on their own to trigger this).
 */
export function getOtpChallenge(contact: string): Promise<unknown> {
    return apiFetch("/auth/otp", { method: "POST", body: JSON.stringify({ id: contact }) });
}

/** Finishes an OTP sign-in ceremony with the code sent by `getOtpChallenge()`. */
export function signInWithOtp(contact: string, token: string): Promise<AuthResult> {
    return apiFetch("/auth/otp", { method: "POST", body: JSON.stringify({ id: contact, token }) });
}

export type AliasType = "email" | "phone" | "name" | "oauth";

export interface Alias {
    uid: string;
    version: number;
    alias: string;
    type: AliasType;
    userUid: string;
    verified: boolean;
}

/** Lists the authenticated caller's own aliases (login identifiers) — scoped server-side to the caller. */
export function listAliases(): Promise<Alias[]> {
    return apiFetch("/aliases");
}

/**
 * Registers a new alias (an additional e-mail, phone number, or username the caller can sign in with).
 * `verified` defaults to `false` (the server only honors a `true` claim on an e-mail/phone alias when the
 * caller's own Profile already lists that exact contact as verified — see `createAlias(type, contact, true)`
 * right after a successful `verifyContact()`, which is the only legitimate way to pass `true` here).
 */
export function createAlias(type: AliasType, alias: string, verified = false): Promise<Alias> {
    return apiFetch("/aliases", { method: "POST", body: JSON.stringify({ type, alias, verified }) });
}

/** Removes one of the authenticated caller's own aliases. */
export function deleteAlias(uid: string): Promise<void> {
    return apiFetch(`/aliases/${encodeURIComponent(uid)}`, { method: "DELETE" });
}

/** Registers a new username (`name`-type alias) for the caller. Always created verified. */
export function createUsernameAlias(value: string): Promise<Alias> {
    return createAlias("name", value, true);
}

/**
 * "Changes" the caller's username. `Alias`'s `update`/`updateBulk`/`updateProperty` endpoints are
 * disabled server-side (they always 404) — there is no in-place rename, so this deletes the old alias and
 * creates the new one as two separate, non-atomic requests. If the create fails (e.g. the new name is
 * already taken), the old username has still been removed; callers should surface the error clearly since
 * there's no automatic rollback.
 */
export async function updateUsernameAlias(oldUid: string, value: string): Promise<Alias> {
    await deleteAlias(oldUid);
    return createUsernameAlias(value);
}

export type SecretType = "password" | "totp" | "passkey" | "fido2";

/** The shape returned by `GET /secrets` and `GET /secrets/:id` — `data` is always scrubbed server-side. */
export interface SecretSummary {
    uid: string;
    version: number;
    type: SecretType;
    userUid: string;
    dateCreated: string;
}

/** Lists the authenticated caller's own registered sign-in methods (secrets) — scoped server-side to the caller. */
export function listSecrets(): Promise<SecretSummary[]> {
    return apiFetch("/secrets");
}

/** Removes one of the authenticated caller's own secrets (password, authenticator app, passkey, or security key). */
export function deleteSecret(uid: string): Promise<void> {
    return apiFetch(`/secrets/${encodeURIComponent(uid)}`, { method: "DELETE" });
}

export interface TotpSecretData {
    secret: string;
    digits: number;
    period: number;
    algorithm: string;
    uri: string;
}

export interface CreatedTotpSecret extends SecretSummary {
    data: TotpSecretData;
}

/**
 * Registers a new authenticator-app (TOTP) secret. The server generates the Base32 secret and an
 * `otpauth://` provisioning URI for a QR code, but only ever returns them in THIS response — every later
 * `GET`/list scrubs `data` from all Secret types, so the caller must capture and display the QR
 * code/manual-entry string immediately, since it can never be re-fetched.
 */
export function createTotpSecret(): Promise<CreatedTotpSecret> {
    return apiFetch("/secrets", { method: "POST", body: JSON.stringify({ type: "totp" }) });
}

/** Begins a passkey *registration* ceremony (as opposed to `getPasskeyChallenge()`, which is for sign-in). */
export function getPasskeyRegistrationOptions(): Promise<unknown> {
    return apiFetch("/secrets/passkey/register");
}

/** Finishes a passkey registration ceremony with the `RegistrationResponseJSON` from `startRegistration()`. */
export function registerPasskey(response: unknown): Promise<SecretSummary> {
    return apiFetch("/secrets", { method: "POST", body: JSON.stringify({ type: "passkey", data: response }) });
}

/** Begins a FIDO2 security key *registration* ceremony (as opposed to `getFido2Challenge()`, which is for sign-in). */
export function getFido2RegistrationOptions(): Promise<unknown> {
    return apiFetch("/secrets/fido2/register");
}

/** Finishes a FIDO2 registration ceremony with the `RegistrationResponseJSON` from `startRegistration()`. */
export function registerFido2(response: unknown): Promise<SecretSummary> {
    return apiFetch("/secrets", { method: "POST", body: JSON.stringify({ type: "fido2", data: response }) });
}
