// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { getKnownUid, rememberKnownUid } from "../../../apps/shared/lib/knownAccounts.js";

afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("getKnownUid", () => {
    it("returns null when nothing has been cached for the identifier", () => {
        expect(getKnownUid("a@example.com")).toBeNull();
    });

    it("returns the uid remembered for a previously seen identifier", () => {
        rememberKnownUid("a@example.com", "u1");
        expect(getKnownUid("a@example.com")).toBe("u1");
    });

    it("normalizes identifiers (trims/lowercases) so lookups match regardless of case or whitespace", () => {
        rememberKnownUid("  A@Example.com  ", "u1");
        expect(getKnownUid("a@example.com")).toBe("u1");
        expect(getKnownUid(" a@EXAMPLE.com ")).toBe("u1");
    });

    it("returns null (rather than throwing) when the stored value isn't valid JSON", () => {
        localStorage.setItem("rr_known_accounts", "not json");
        expect(getKnownUid("a@example.com")).toBeNull();
    });
});

describe("rememberKnownUid", () => {
    it("overwrites a previous mapping for the same identifier", () => {
        rememberKnownUid("a@example.com", "u1");
        rememberKnownUid("a@example.com", "u2");
        expect(getKnownUid("a@example.com")).toBe("u2");
    });

    it("evicts the oldest entry once more than the max number of identifiers are cached", () => {
        for (let i = 0; i < 21; i++) {
            rememberKnownUid(`user${i}@example.com`, `u${i}`);
        }
        expect(getKnownUid("user0@example.com")).toBeNull();
        expect(getKnownUid("user20@example.com")).toBe("u20");
    });

    it("does not throw when localStorage is unavailable (e.g. disabled/private browsing)", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        expect(() => rememberKnownUid("a@example.com", "u1")).not.toThrow();
    });
});
