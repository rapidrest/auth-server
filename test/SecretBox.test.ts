///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/messaging/SecretBox.js";

const KEY = "96aa4879e304e525b74141bf1bc072c17e2b90c5b35250a2d18cbd2b8d4172ac";
const OTHER_KEY = "0000000000000000000000000000000000000000000000000000000000000001";

describe("SecretBox", () => {
    it("round-trips a secret, including non-ASCII text", () => {
        for (const secret of ["auth-token-123", "", "pässwörd-日本語"]) {
            expect(decryptSecret(encryptSecret(secret, KEY), KEY)).toBe(secret);
        }
    });

    it("doesn't contain the secret, and looks the way the auth library's envelope does", () => {
        const envelope = encryptSecret("auth-token-123", KEY);

        expect(envelope.startsWith("enc:v1:")).toBe(true);
        expect(envelope).not.toContain("auth-token-123");
        expect(Buffer.from(envelope.slice("enc:v1:".length), "base64").toString("latin1")).not.toContain("auth-token-123");
    });

    it("encrypts the same secret differently each time", () => {
        expect(encryptSecret("same", KEY)).not.toBe(encryptSecret("same", KEY));
    });

    it("can't be decrypted with a different key", () => {
        expect(() => decryptSecret(encryptSecret("secret", KEY), OTHER_KEY)).toThrow();
    });

    it("notices tampering", () => {
        const envelope = encryptSecret("secret", KEY);
        const raw = Buffer.from(envelope.slice("enc:v1:".length), "base64");
        raw[raw.length - 1] ^= 0xff;

        expect(() => decryptSecret("enc:v1:" + raw.toString("base64"), KEY)).toThrow();
    });

    it("refuses a value that isn't an encrypted secret, rather than returning it as if it were", () => {
        expect(() => decryptSecret("plaintext-token", KEY)).toThrow("The value is not an encrypted secret.");
    });

    it("refuses a key that isn't 32 bytes of hex, or is missing, rather than encrypting weakly", () => {
        for (const bad of ["", "abc", "zz".repeat(32), "aa".repeat(16)]) {
            expect(() => encryptSecret("secret", bad)).toThrow("64-character hex");
        }
        expect(() => encryptSecret("secret", undefined as any)).toThrow("64-character hex");
        expect(() => decryptSecret(encryptSecret("secret", KEY), "abc")).toThrow("64-character hex");
    });
});
