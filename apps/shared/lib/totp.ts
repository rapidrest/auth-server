///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Just enough of RFC 6238 (TOTP) / RFC 4226 (HOTP) to check a code typed from an authenticator app against the
 * secret this server just generated for it — see `TotpSecretForm`. Uses `@noble/hashes` (pure JS, like
 * `clientPasswordHash.ts`) rather than WebCrypto, whose `subtle` is only present in a secure context.
 *
 * This is a set-up sanity check, not an authentication boundary: the caller already holds the secret, so a
 * match only proves the user's app has been given the same one. Signing in with the code is still verified
 * server-side, with replay protection, by `AuthTOTPRoute`.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";

const HASHES = { sha1, sha256, sha512 } as const;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** The parameters a registered secret was created with — the fields of `TotpSecretData` needed to compute a code. */
export interface TotpParams {
    /** The Base32-encoded shared secret. */
    secret: string;
    digits: number;
    /** The length of one time step, in seconds. */
    period: number;
    /** `sha1`, `sha256` or `sha512`, in any case (an `otpauth://` URI spells it upper-case). */
    algorithm: string;
}

function decodeBase32(input: string): Uint8Array {
    const clean = input.replace(/[\s=-]/g, "").toUpperCase();
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean) {
        const value = BASE32_ALPHABET.indexOf(char);
        if (value < 0) {
            throw new Error("Invalid Base32 character in TOTP secret.");
        }
        buffer = (buffer << 5) | value;
        bits += 5;
        if (bits >= 8) {
            bytes.push((buffer >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Uint8Array.from(bytes);
}

/** The code an authenticator app would show for the given time step (RFC 4226 §5.3 dynamic truncation). */
function codeForStep(params: TotpParams, step: number): string {
    const hash = HASHES[params.algorithm.toLowerCase().replace("-", "") as keyof typeof HASHES];
    if (!hash) {
        throw new Error(`Unsupported TOTP algorithm '${params.algorithm}'.`);
    }
    const counter = new DataView(new ArrayBuffer(8));
    counter.setUint32(0, Math.floor(step / 2 ** 32));
    counter.setUint32(4, step >>> 0);
    const mac = hmac(hash, decodeBase32(params.secret), new Uint8Array(counter.buffer));
    const offset = mac[mac.length - 1] & 0x0f;
    const binary =
        ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
    return String(binary % 10 ** params.digits).padStart(params.digits, "0");
}

/**
 * Whether `code` is what the secret's authenticator would currently show. Also accepts the steps either side of
 * now (`window`, default 1 — ±one period) so a phone clock that's a few seconds off, or a code typed just as it
 * rolls over, doesn't turn a correctly set-up app into a failure. Throws for a secret it can't compute
 * (an unsupported algorithm or a malformed Base32 secret).
 */
export function verifyTotpCode(params: TotpParams, code: string, nowMs: number = Date.now(), window = 1): boolean {
    const current = Math.floor(nowMs / 1000 / params.period);
    for (let offset = -window; offset <= window; offset++) {
        if (codeForStep(params, current + offset) === code) {
            return true;
        }
    }
    return false;
}
