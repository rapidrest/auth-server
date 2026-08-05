/**
 * Minimal client-side helpers shared by the auth pages: a `fetch` wrapper that talks to the same-origin
 * RapidREST API and attaches the JWT, plus small helpers for storing/clearing that token. There is no
 * client router or HTTP client shipped by `@rapidrest/react`, so this is deliberately small and framework-free.
 */

const TOKEN_STORAGE_KEY = "rrst.jwt";
const TOKEN_COOKIE_NAME = "jwt";

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
 * Persists the JWT for subsequent client-side `fetch()` calls (localStorage) and as a cookie so that the
 * next SSR page render (e.g. navigating to `/`) is authenticated server-side too, since `JWTStrategy`
 * checks a `jwt` cookie by default.
 */
export function setAuthToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
        // Ignore storage failures (e.g. private browsing quota) — the cookie below still works for SSR.
    }
    const maxAge = 60 * 60 * 24 * 7;
    document.cookie = `${TOKEN_COOKIE_NAME}=${token}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function clearAuthToken(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
        // Ignore.
    }
    document.cookie = `${TOKEN_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
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
    if (token) {
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
