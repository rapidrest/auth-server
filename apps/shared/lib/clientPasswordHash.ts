///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Client-side Argon2id password hashing, matching `@rapidrest/auth`'s `normalizePasswordSubmission()`
 * contract (see `shared.ts` in the `@rapidrest/auth` package): a capable client hashes a password locally
 * before it ever leaves the browser, using a deterministic per-account salt and a fixed, non-configurable
 * set of Argon2id parameters, and submits the resulting PHC-encoded string in place of the raw password.
 * The server tells a hashed submission apart from plaintext purely by its shape (a regex match against the
 * PHC format), so a value produced here is indistinguishable from — and interchangeable with — one hashed
 * by any other capable client for the same account.
 *
 * Uses `@noble/hashes`'s pure-JS/TS `argon2idAsync` (RFC 9106) rather than a WASM implementation: no WASM
 * asset to serve and no CSP `wasm-unsafe-eval` considerations, and it yields periodically instead of
 * blocking the main thread. Verified to produce byte-identical output to the `argon2` (node) binding the
 * server uses, for the same password/salt/parameters.
 */

import { argon2idAsync } from "@noble/hashes/argon2.js";

/**
 * Mirrors `CLIENT_ARGON2_PARAMS` in `@rapidrest/auth`'s `src/auth/shared.ts` exactly. These are NOT
 * configurable — changing them changes the hash output and breaks login from any client still using the
 * old constants, and the server independently rejects a submission whose embedded parameters fall below
 * its own configured `client_hash_min_*` floor (which defaults to these same values).
 */
export const CLIENT_ARGON2_PARAMS = {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
} as const;

/** The Argon2 version this module encodes into the PHC string — `0x13` (19), matching the server's `argon2` binding. */
const ARGON2_VERSION = 0x13;

/**
 * Whether this browser can hash a password client-side. Requires `crypto.subtle` (Web Crypto), which is
 * only exposed in a secure context (HTTPS or localhost) — the same condition under which doing this at all
 * is worthwhile. Callers should fall back to submitting a raw password when this is `false`, exactly as an
 * incapable/legacy client would; the server accepts either form.
 */
export function canHashClientSide(): boolean {
    return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

/**
 * Derives the deterministic salt for `userUid`: the SHA-256 digest of the account's `uid`, matching
 * `deriveClientSalt()` in `@rapidrest/auth`'s `shared.ts` (`crypto.createHash("sha256").update(userUid).digest()`).
 * Using `uid` (immutable, unique, returned on every successful login) rather than an email/username avoids
 * the salt changing if the account's contact info is later edited.
 */
async function deriveClientSalt(userUid: string): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userUid));
    return new Uint8Array(digest);
}

/** Base64-encodes `bytes` without padding, matching the PHC encoding the server's `argon2` binding produces. */
function toBase64NoPad(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/=+$/, "");
}

/**
 * Hashes `password` locally for `userUid`, returning a PHC-encoded Argon2id string in the exact form
 * `@rapidrest/auth`'s `isClientHashedFormat()`/`normalizePasswordSubmission()` expect:
 * `` $argon2id$v=19$m=<memoryCost>,p=<parallelism>,t=<timeCost>$<saltB64>$<hashB64> `` (note the `m,p,t`
 * key order — matches the server's own `argon2` binding, not the more common `m,t,p`).
 *
 * Throws on any failure (unsupported browser, an unexpected Web Crypto error) rather than falling back
 * silently — callers should check `canHashClientSide()` first and are responsible for catching an
 * unexpected throw and falling back to submitting `password` as-is, exactly as an incapable client would.
 */
export async function hashPasswordClientSide(password: string, userUid: string): Promise<string> {
    const salt = await deriveClientSalt(userUid);
    const { memoryCost, timeCost, parallelism, hashLength } = CLIENT_ARGON2_PARAMS;
    const hash = await argon2idAsync(password, salt, {
        m: memoryCost,
        t: timeCost,
        p: parallelism,
        dkLen: hashLength,
        version: ARGON2_VERSION,
    });
    return `$argon2id$v=${ARGON2_VERSION}$m=${memoryCost},p=${parallelism},t=${timeCost}$${toBase64NoPad(salt)}$${toBase64NoPad(hash)}`;
}

/**
 * Convenience wrapper around `hashPasswordClientSide()` for every call site in `api.ts`/`adminApi.ts`:
 * hashes `password` for `userUid` when this browser supports it, otherwise (or on any unexpected failure)
 * falls back to returning `password` unchanged — exactly what an incapable/legacy client would submit, and
 * the server accepts either form.
 */
export async function hashPasswordOrFallback(password: string, userUid: string): Promise<string> {
    if (!canHashClientSide()) {
        return password;
    }
    try {
        return await hashPasswordClientSide(password, userUid);
    } catch (err) {
        console.warn("Client-side password hashing failed; submitting plaintext instead.", err);
        return password;
    }
}
