// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_HASHED_PASSWORD_PATTERN } from "../testUtils.js";
import {
    CLIENT_ARGON2_PARAMS,
    canHashClientSide,
    hashPasswordClientSide,
    hashPasswordOrFallback,
} from "../../../apps/shared/lib/clientPasswordHash.js";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("CLIENT_ARGON2_PARAMS", () => {
    it("matches @rapidrest/auth's fixed, non-configurable client-side parameters", () => {
        expect(CLIENT_ARGON2_PARAMS).toEqual({ memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 });
    });
});

describe("canHashClientSide", () => {
    it("is true when crypto.subtle is available (the normal jsdom/browser case)", () => {
        expect(canHashClientSide()).toBe(true);
    });

    it("is false when crypto itself is unavailable", () => {
        vi.stubGlobal("crypto", undefined);
        expect(canHashClientSide()).toBe(false);
    });

    it("is false when crypto.subtle is unavailable (insecure context)", () => {
        vi.stubGlobal("crypto", {});
        expect(canHashClientSide()).toBe(false);
    });
});

describe("hashPasswordClientSide", () => {
    it("produces a PHC-encoded argon2id string with the fixed client params", async () => {
        const hash = await hashPasswordClientSide("hunter2", "u1");
        expect(hash).toMatch(CLIENT_HASHED_PASSWORD_PATTERN);
    });

    it("is deterministic for the same password/uid — same derived salt, same params", async () => {
        const [a, b] = await Promise.all([hashPasswordClientSide("hunter2", "u1"), hashPasswordClientSide("hunter2", "u1")]);
        expect(a).toBe(b);
    });

    it("produces a different hash for a different uid (a different derived salt)", async () => {
        const [a, b] = await Promise.all([hashPasswordClientSide("hunter2", "u1"), hashPasswordClientSide("hunter2", "u2")]);
        expect(a).not.toBe(b);
    });
});

describe("hashPasswordOrFallback", () => {
    it("returns a client-hashed value when this browser supports hashing", async () => {
        const result = await hashPasswordOrFallback("hunter2", "u1");
        expect(result).toMatch(CLIENT_HASHED_PASSWORD_PATTERN);
    });

    it("falls back to the plaintext password when crypto.subtle is unavailable", async () => {
        vi.stubGlobal("crypto", {});
        const result = await hashPasswordOrFallback("hunter2", "u1");
        expect(result).toBe("hunter2");
    });

    it("falls back to the plaintext password (and logs a warning) if hashing throws unexpectedly", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockRejectedValue(new Error("boom")) } });
        const result = await hashPasswordOrFallback("hunter2", "u1");
        expect(result).toBe("hunter2");
        expect(warn).toHaveBeenCalled();
    });
});
