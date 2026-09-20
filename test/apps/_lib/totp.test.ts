///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { verifyTotpCode, TotpParams } from "../../../apps/shared/lib/totp.js";

// RFC 6238 Appendix B test vectors (8 digits, 30s period). Each algorithm has its own ASCII seed, shown here
// Base32-encoded: "12345678901234567890" (20 bytes), and that same digit run extended to 32 / 64 bytes.
const SHA1: TotpParams = { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", digits: 8, period: 30, algorithm: "sha1" };
const SHA256: TotpParams = {
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA",
    digits: 8,
    period: 30,
    algorithm: "sha256",
};
const SHA512: TotpParams = {
    secret:
        "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA",
    digits: 8,
    period: 30,
    algorithm: "sha512",
};

describe("verifyTotpCode", () => {
    it("matches the RFC 6238 vectors for SHA-1, SHA-256 and SHA-512", () => {
        expect(verifyTotpCode(SHA1, "94287082", 59_000, 0)).toBe(true);
        expect(verifyTotpCode(SHA256, "46119246", 59_000, 0)).toBe(true);
        expect(verifyTotpCode(SHA512, "90693936", 59_000, 0)).toBe(true);
    });

    it("matches further RFC 6238 vectors at later times, including a counter above 32 bits", () => {
        expect(verifyTotpCode(SHA1, "07081804", 1_111_111_105_000, 0)).toBe(true);
        expect(verifyTotpCode(SHA1, "65353130", 20_000_000_000_000, 0)).toBe(true);
    });

    it("rejects a wrong code", () => {
        expect(verifyTotpCode(SHA1, "00000000", 59_000)).toBe(false);
    });

    it("accepts the neighbouring steps by default, to tolerate clock skew", () => {
        // 94287082 is the code for step 1 (30-59s). At t=89s the current step is 2, so it's one step back.
        expect(verifyTotpCode(SHA1, "94287082", 89_000)).toBe(true);
        // ...and at t=29s the current step is 0, so it's one step ahead.
        expect(verifyTotpCode(SHA1, "94287082", 29_000)).toBe(true);
    });

    it("rejects a code more than the window away", () => {
        expect(verifyTotpCode(SHA1, "94287082", 119_000)).toBe(false);
        expect(verifyTotpCode(SHA1, "94287082", 89_000, 0)).toBe(false);
    });

    it("accepts the upper-case algorithm spelling an otpauth:// URI uses", () => {
        expect(verifyTotpCode({ ...SHA1, algorithm: "SHA1" }, "94287082", 59_000, 0)).toBe(true);
    });

    it("computes a 6-digit code, zero-padded, when that's what the secret was created with", () => {
        // The last six digits of the 8-digit vector — RFC 4226 truncation is a modulo, so this is exact.
        expect(verifyTotpCode({ ...SHA1, digits: 6 }, "287082", 59_000, 0)).toBe(true);
        // Step 1 for this secret at 6 digits has a leading zero in some steps; the padded form must match.
        expect(verifyTotpCode({ ...SHA1, digits: 6 }, "081804", 1_111_111_105_000, 0)).toBe(true);
    });

    it("tolerates a lower-case secret and the spaces/dashes authenticator apps display it with", () => {
        const spaced = "gezd gnbv-gy3t qojq gezd gnbv gy3t qojq";
        expect(verifyTotpCode({ ...SHA1, secret: spaced }, "94287082", 59_000, 0)).toBe(true);
    });

    it("defaults to the current time", () => {
        expect(verifyTotpCode(SHA1, "00000000")).toBeTypeOf("boolean");
    });

    it("throws for an algorithm it can't compute rather than reporting a mismatch", () => {
        expect(() => verifyTotpCode({ ...SHA1, algorithm: "md5" }, "12345678", 59_000)).toThrow(/Unsupported TOTP algorithm/);
    });

    it("throws for a secret that isn't Base32", () => {
        expect(() => verifyTotpCode({ ...SHA1, secret: "not*base32" }, "12345678", 59_000)).toThrow(/Base32/);
    });
});
