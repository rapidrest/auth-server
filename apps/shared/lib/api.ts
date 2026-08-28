/**
 * Minimal client-side helpers shared by the auth pages: a `fetch` wrapper that talks to the same-origin
 * RapidREST API. There is no client router or HTTP client shipped by `@rapidrest/react`, so this is
 * deliberately small and framework-free.
 *
 * Authentication is handled entirely via the `jwt` HttpOnly cookie the server sets on every successful
 * sign-in/sign-up (see `auth:cookie` config / `TokenUtils`) — the browser attaches it automatically to
 * every same-origin `fetch()` call (the default `credentials: "same-origin"` mode), and the server's
 * `JWTStrategy` accepts it as a credential for every authenticated request, not just SSR page loads. No
 * token is ever held in JS-accessible storage, so it can't be read or exfiltrated via XSS.
 */

import { requestElevation } from "./elevation.js";

export interface ApiUser {
    uid: string;
    version: number;
    roles: string[];
    scopes: string[];
    verified?: boolean;
    /** When `true`, this account must complete a second factor to sign in (see `signInWithPassword`/MFA sign-in). */
    requireMFA?: boolean;
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

/**
 * Mirrors `@rapidrest/service-core`'s `ApiErrors.AUTH_REQUIRES_ELEVATION` — kept as a local literal rather
 * than an import since this file is deliberately dependency-free (see the module doc comment above).
 */
const AUTH_REQUIRES_ELEVATION = "api-104";

/**
 * Signs the current user out by clearing the server-set `jwt` cookie (an `HttpOnly` cookie can only be
 * cleared by the server writing a new `Set-Cookie`, never by client JavaScript) via `POST /auth/logout`.
 * Callers redirect unconditionally right after awaiting this (see `account`/`AdminShell`), so a failed
 * network request is swallowed rather than thrown — better to navigate the user away from the
 * authenticated page than strand them on it because the logout call itself didn't reach the server.
 */
export async function logout(): Promise<void> {
    try {
        await apiFetch("/auth/logout", { method: "POST" });
    } catch {
        // Best-effort — see doc comment above.
    }
}

/**
 * `fetch()` against the same-origin API, decoding RapidREST-shaped errors. `path` is the route as
 * declared by `@ApiRoute` (e.g. `/register/start`) — the `/api` prefix that decorator always adds is
 * applied here, in one place, rather than repeated at every call site. Authentication rides along
 * automatically via the `jwt` HttpOnly cookie (browsers attach cookies to same-origin `fetch()` calls by
 * default); callers that need a different credential (e.g. password sign-in's `Authorization: Basic`)
 * set their own header, which is left untouched here.
 *
 * A response carrying `AUTH_REQUIRES_ELEVATION` (`api-104` — see `@RequiresElevation` server-side) is
 * intercepted here rather than surfaced to the caller: this hands off to `requestElevation()` (see
 * `elevation.ts`), which resolves once `ElevationHost` has walked the user through the challenge described
 * by `BaseAuthElevationRoute` and obtained a fresh elevated token/cookie. On success the original request
 * is transparently retried exactly once (`retry` guards against looping if it somehow fails again); every
 * existing call site gets this behavior for free without knowing elevation exists. On cancellation the
 * original `api-104` error is thrown as normal. `api-103` (`AUTH_REQUIRES_TRUSTED_ROLE`) is a different,
 * non-promptable code — the caller doesn't hold the required role at all, even once elevated — and is left
 * to surface as a normal error.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");

    const res = await fetch(`/api${path}`, { ...init, headers });
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
        const code = body?.code;
        if (code === AUTH_REQUIRES_ELEVATION && retry && path !== "/auth/elevation") {
            const elevated = await requestElevation();
            if (elevated) {
                return apiFetch<T>(path, init, false);
            }
        }
        const message = (body && (body.message || body.error)) || res.statusText || "Request failed.";
        throw new ApiRequestError(message, res.status, code);
    }

    return body as T;
}

/** Fetches the authenticated caller's own `User` record (roles, scopes, verified) — used e.g. to check for admin access. */
export function getCurrentUser(): Promise<ApiUser> {
    return apiFetch("/users/me");
}

export interface UpdateSelfUserInput {
    uid: string;
    /** Must be the `version` from the most recently fetched copy of this account (optimistic concurrency). */
    version: number;
    requireMFA?: boolean;
}

/**
 * Updates the authenticated caller's own `User` record (e.g. toggling `requireMFA`) — self-service, no
 * admin role needed: `BaseUserRoute.create()` grants a new account's own uid full CRUD on its own record,
 * and `id === "me"` is special-cased server-side to resolve to the caller.
 */
export function updateSelfUser(input: UpdateSelfUserInput): Promise<ApiUser> {
    return apiFetch("/users/me", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Exchanges the `refresh` HttpOnly cookie set on sign-in for a fresh access/refresh token pair — no body
 * needed, the server reads the refresh cookie (and the session it's bound to) itself. Access tokens are
 * short-lived (1 hour); see `useSessionRefresh` for where this is called from (a recurring timer while a
 * page is open, plus a one-time attempt before redirecting to sign-in when the access token is missing).
 */
export function refreshAccessToken(): Promise<AuthResult> {
    return apiFetch("/auth/refresh", { method: "POST" });
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
 * `hint` is an optional caller-supplied label (e.g. "LastPass") to help identify this secret later — it's a
 * discrete top-level field on `Secret`, not part of `data`, so it survives the server-side scrub of `data`
 * on every later `GET`/list.
 */
export function createPasswordSecret(password: string, hint?: string): Promise<SecretSummary> {
    return apiFetch("/secrets", {
        method: "POST",
        body: JSON.stringify({ type: "password", data: password, ...(hint ? { hint } : {}) }),
    });
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

/** One of an account's registered secondary (2FA) authentication methods, as returned by `/auth/mfa`. */
export interface MfaMethod {
    id: string;
    type: "fido2" | "otp" | "totp";
    data: any;
}

/** Phase-1 (`id`+`password`) response from `/auth/mfa` when the account has a second factor to complete. */
export interface MfaChallenge {
    uid: string;
    methods: MfaMethod[];
}

/** Narrows a `signInWithPassword()` result: `true` when a second factor still needs to be completed. */
export function isMfaChallenge(result: AuthResult | MfaChallenge): result is MfaChallenge {
    return "methods" in result;
}

/**
 * Signs in with an account identifier (email, phone, or username) and password, via `/auth/mfa` rather
 * than the simpler `/auth/password` (`BasicStrategy`) — the latter now unconditionally refuses any account
 * with `requireMFA: true` (see `BaseAuthBasicRoute`), and even for accounts without that flag set, it
 * doesn't enforce an already-registered `totp`/`fido2` secret at all. `/auth/mfa` (`MFAStrategy`) does: if
 * the account has no secondary method registered, this resolves a normal `AuthResult` exactly as
 * `/auth/password` used to; if it does, it instead resolves `{uid, methods}` and the caller must complete
 * the challenge via `beginMfaChallenge`/`verifyMfaCode`/`verifyMfaFido2` below.
 */
export function signInWithPassword(id: string, password: string): Promise<AuthResult | MfaChallenge> {
    return apiFetch("/auth/mfa", { method: "POST", body: JSON.stringify({ id, password }) });
}

/**
 * Completes an OAuth/OIDC sign-in after the provider has redirected the browser back to this page
 * with `?code=...&state=...` (or `?error=...`) appended to the URL. `search` is that query string
 * forwarded as-is to the matching backend route (`/auth/<provider>`, e.g. `/auth/google`), which
 * performs the token exchange server-side (validating `state` against the session it started) and
 * resolves the same `AuthResult` shape as every other sign-in method — including throwing a normal
 * `ApiRequestError` if the provider reported an error or the exchange failed, so the caller's usual
 * `err instanceof ApiRequestError` handling applies here too, same as everywhere else in this file.
 */
export function completeOAuthSignIn(provider: string, search: string): Promise<AuthResult> {
    return apiFetch(`/auth/${provider}${search}`);
}

/**
 * Begins the selected second-factor challenge (phase 2 of `/auth/mfa`) using the `uid`/`methods[].id` from
 * `signInWithPassword()`'s `MfaChallenge` result. Resolves `{}` for `otp`/`totp` (a code was sent, or the
 * client's authenticator app already has one) or a WebAuthn `PublicKeyCredentialRequestOptionsJSON` for
 * `fido2`, to pass to `startAuthentication()`.
 */
export function beginMfaChallenge(uid: string, methodId: string): Promise<unknown> {
    return apiFetch("/auth/mfa", { method: "POST", body: JSON.stringify({ id: uid, methodId }) });
}

/** Completes an `otp`/`totp` second-factor challenge (phase 3) with the submitted code. */
export function verifyMfaCode(uid: string, token: string): Promise<AuthResult> {
    return apiFetch("/auth/mfa", { method: "POST", body: JSON.stringify({ id: uid, token }) });
}

/** Completes a `fido2` second-factor challenge (phase 3) with the `AuthenticationResponseJSON` from `startAuthentication()`. */
export function verifyMfaFido2(response: unknown): Promise<AuthResult> {
    return apiFetch("/auth/mfa", { method: "POST", body: JSON.stringify(response) });
}

/** One of the authenticated caller's own methods for elevating (see `/auth/elevation`, `BaseAuthElevationRoute`). */
export interface ElevationMethod {
    id: string;
    type: "fido2" | "otp" | "totp";
    data: any;
}

/**
 * Lists the authenticated caller's own available methods for elevating — an empty array means none are
 * enrolled and `elevateWithPassword()` must be used instead (see `BaseAuthElevationRoute.listMethods`).
 * Not normally called directly: `ElevationHost` calls this itself once `requestElevation()` (see
 * `elevation.ts`) signals that a prompt is needed.
 */
export function listElevationMethods(): Promise<ElevationMethod[]> {
    return apiFetch("/auth/elevation");
}

/**
 * Begins an elevation challenge for one of the caller's own methods (from `listElevationMethods()`).
 * Resolves `{}` for `otp` (a code was sent to the associated contact) or `totp` (the caller's authenticator
 * app already has the current code), or a WebAuthn `PublicKeyCredentialRequestOptionsJSON` for `fido2`, to
 * pass to `startAuthentication()`.
 */
export function beginElevationChallenge(methodId: string): Promise<unknown> {
    return apiFetch("/auth/elevation", { method: "POST", body: JSON.stringify({ methodId }) });
}

/** Completes an `otp`/`totp` elevation challenge (begun by `beginElevationChallenge()`) with the submitted code. */
export function completeElevationChallenge(token: string): Promise<AuthResult> {
    return apiFetch("/auth/elevation", { method: "POST", body: JSON.stringify({ token }) });
}

/** Completes a `fido2` elevation challenge with the `AuthenticationResponseJSON` from `startAuthentication()`. */
export function completeElevationFido2(response: unknown): Promise<AuthResult> {
    return apiFetch("/auth/elevation", { method: "POST", body: JSON.stringify(response) });
}

/**
 * Elevates by resubmitting the caller's password instead of a secondary method — only accepted by the
 * server when `listElevationMethods()` returned an empty array (see `BaseAuthElevationRoute.verifyPasswordOnly`).
 */
export function elevateWithPassword(password: string): Promise<AuthResult> {
    return apiFetch("/auth/elevation", { method: "POST", body: JSON.stringify({ password }) });
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

/**
 * The shape returned by `GET /secrets` and `GET /secrets/:id` — `data` is always scrubbed server-side, but
 * `hint` is a discrete top-level field on `Secret` (not part of `data`), so it survives that scrub and is
 * always available to help identify which secret is which later.
 */
export interface SecretSummary {
    uid: string;
    version: number;
    type: SecretType;
    userUid: string;
    dateCreated: string;
    hint?: string;
}

/**
 * Whether the given secrets/aliases include at least one method the server's `/auth/mfa` route would
 * accept as a second factor — mirrors `MFAStrategy.getMethods()`: a `totp`/`fido2` secret, or a verified
 * `email`/`phone` alias (OTP-eligible). Used to decide whether a `requireMFA` account still needs to be
 * prompted to set one up (see `RequireMfaSetupModal`).
 */
export function hasSecondFactor(secrets: SecretSummary[] | null, aliases: Alias[] | null): boolean {
    const hasQualifyingSecret = (secrets ?? []).some((s) => s.type === "totp" || s.type === "fido2");
    const hasQualifyingAlias = (aliases ?? []).some((a) => (a.type === "email" || a.type === "phone") && a.verified);
    return hasQualifyingSecret || hasQualifyingAlias;
}

/** Lists the authenticated caller's own registered sign-in methods (secrets) — scoped server-side to the caller. */
export function listSecrets(): Promise<SecretSummary[]> {
    return apiFetch("/secrets");
}

/** Removes one of the authenticated caller's own secrets (password, authenticator app, passkey, or security key). */
export function deleteSecret(uid: string): Promise<void> {
    return apiFetch(`/secrets/${encodeURIComponent(uid)}`, { method: "DELETE" });
}

export interface UpdateSecretInput {
    uid: string;
    /** Must be the `version` from the most recently fetched copy of this secret (optimistic concurrency). */
    version: number;
    /** A new plaintext value — only meaningful for `password`/`totp` secrets. `passkey`/`fido2` data is immutable. */
    data?: string;
    /** Set, change, or clear (pass `""`) this secret's label. */
    hint?: string;
}

/**
 * Updates one of the authenticated caller's own secrets in place — e.g. changing a password's value, or
 * setting/editing its `hint` — instead of creating a replacement and deleting the old one.
 */
export function updateSecret(input: UpdateSecretInput): Promise<SecretSummary> {
    return apiFetch(`/secrets/${encodeURIComponent(input.uid)}`, { method: "PUT", body: JSON.stringify(input) });
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
 * code/manual-entry string immediately, since it can never be re-fetched. `hint` is an optional
 * caller-supplied label (see `createPasswordSecret`'s doc comment).
 */
export function createTotpSecret(hint?: string): Promise<CreatedTotpSecret> {
    return apiFetch("/secrets", { method: "POST", body: JSON.stringify({ type: "totp", ...(hint ? { hint } : {}) }) });
}

/** Begins a passkey *registration* ceremony (as opposed to `getPasskeyChallenge()`, which is for sign-in). */
export function getPasskeyRegistrationOptions(): Promise<unknown> {
    return apiFetch("/secrets/passkey/register");
}

/**
 * Finishes a passkey registration ceremony with the `RegistrationResponseJSON` from `startRegistration()`.
 * `hint` is an optional caller-supplied label (see `createPasswordSecret`'s doc comment).
 */
export function registerPasskey(response: unknown, hint?: string): Promise<SecretSummary> {
    return apiFetch("/secrets", {
        method: "POST",
        body: JSON.stringify({ type: "passkey", data: response, ...(hint ? { hint } : {}) }),
    });
}

/** Begins a FIDO2 security key *registration* ceremony (as opposed to `getFido2Challenge()`, which is for sign-in). */
export function getFido2RegistrationOptions(): Promise<unknown> {
    return apiFetch("/secrets/fido2/register");
}

/**
 * Finishes a FIDO2 registration ceremony with the `RegistrationResponseJSON` from `startRegistration()`.
 * `hint` is an optional caller-supplied label (see `createPasswordSecret`'s doc comment).
 */
export function registerFido2(response: unknown, hint?: string): Promise<SecretSummary> {
    return apiFetch("/secrets", {
        method: "POST",
        body: JSON.stringify({ type: "fido2", data: response, ...(hint ? { hint } : {}) }),
    });
}

/** The consolidated view of an account returned by `GET /accounts/:id` — everything the account page needs in one round trip. */
export interface AccountData {
    user: ApiUser;
    /** Absent when the account has no `Profile` yet (e.g. a freshly-registered account) — mirrors `getProfile()`'s 404 case. */
    profile?: Profile;
    aliases: Alias[];
    secrets: SecretSummary[];
}

/**
 * Fetches all data (user, profile, aliases, secrets) for an account in a single request. Defaults to the
 * caller's own account (`"me"`); only a trusted role (e.g. `admin`) may pass another account's uid.
 */
export function getAccount(id = "me"): Promise<AccountData> {
    return apiFetch(`/accounts/${encodeURIComponent(id)}`);
}

/**
 * Permanently deletes an account and all of its associated data (aliases, secrets, profile). Defaults to
 * the caller's own account (`"me"`); only a trusted role may delete another account. Irreversible.
 */
export function deleteAccount(id = "me"): Promise<void> {
    return apiFetch(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
