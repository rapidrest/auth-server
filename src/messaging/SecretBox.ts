///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import crypto from "crypto";

/**
 * Encrypts a secret that has to be stored and read back later (e.g. the Twilio auth token), so a copy of the
 * database alone doesn't reveal it. AES-256-GCM with a fresh random IV per call, stored as
 * `"enc:v1:" + base64(iv[12] + authTag[16] + ciphertext)` — the same envelope `@rapidrest/auth` uses for TOTP
 * secrets and signing keys, so it reads the same to anyone who knows that one. Those helpers are specific to their
 * own config keys (their errors name `auth:totp:encryption_key`), so this is the same idea without that coupling.
 *
 * Unlike the TOTP helper it never falls back to storing plaintext when there's no key: a caller with no key has to
 * decide what to do about that, rather than a credential quietly going into the database in the clear.
 */
const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** The 32 bytes AES-256 needs, from a 64-character hex `key`. Throws rather than encrypt with a key of the wrong size. */
function keyBuffer(key: string): Buffer {
    const buffer = Buffer.from(key ?? "", "hex");
    if (buffer.length !== 32) {
        throw new Error("The encryption key must be a 64-character hex string (32 bytes) for AES-256-GCM.");
    }
    return buffer;
}

export function encryptSecret(plaintext: string, key: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer(key), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** Throws if `envelope` isn't something `encryptSecret()` produced, was tampered with, or was made with another key. */
export function decryptSecret(envelope: string, key: string): string {
    if (!envelope.startsWith(PREFIX)) {
        throw new Error("The value is not an encrypted secret.");
    }
    const raw = Buffer.from(envelope.slice(PREFIX.length), "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer(key), raw.subarray(0, IV_LENGTH));
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
    return Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)), decipher.final()]).toString("utf8");
}
