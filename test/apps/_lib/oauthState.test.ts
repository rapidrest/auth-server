///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { decodeOAuthState, encodeOAuthState } from "../../../apps/shared/lib/oauthState.js";

const b64url = (text: string) => Buffer.from(text, "utf-8").toString("base64url");

describe("encodeOAuthState", () => {
    it("is just the provider name when there is no return_to, exactly as before return_to existed", () => {
        expect(encodeOAuthState("google")).toBe("google");
        expect(encodeOAuthState("google", null)).toBe("google");
        expect(encodeOAuthState("google", "")).toBe("google");
    });

    it("appends the return_to as base64url, after a '.'", () => {
        const target = "https://mail.mydomain.com/inbox?folder=sent&x=a b#top";
        expect(encodeOAuthState("microsoft", target)).toBe(`microsoft.${b64url(target)}`);
    });

    it("produces a value with no characters that need escaping in a query string, and no extra '.'", () => {
        // `+`, `/` and `=` are what standard base64 would emit for this input.
        const encoded = encodeOAuthState("google", "https://a.com/???>>>~~~");
        const [provider, rest, ...more] = encoded.split(".");
        expect(provider).toBe("google");
        expect(more).toEqual([]);
        expect(rest).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("encodes non-ASCII text as UTF-8", () => {
        const target = "https://mail.mydomain.com/café/日本語";
        expect(encodeOAuthState("google", target)).toBe(`google.${b64url(target)}`);
    });

    it("drops a return_to too long to fit safely in state rather than breaking the provider redirect", () => {
        expect(encodeOAuthState("google", `https://mail.mydomain.com/${"a".repeat(2000)}`)).toBe("google");
    });

    it("keeps one that is just under the limit", () => {
        // 768 bytes encode to exactly 1024 base64url characters.
        const target = "x".repeat(768);
        expect(encodeOAuthState("google", target)).toBe(`google.${b64url(target)}`);
    });
});

describe("decodeOAuthState", () => {
    it("recovers the provider from the combined <csrf>.<provider> value", () => {
        expect(decodeOAuthState("csrf123.google")).toEqual({ provider: "google", returnTo: null });
    });

    it("recovers a return_to that was carried alongside the provider", () => {
        const target = "https://mail.mydomain.com/inbox?folder=sent#top";
        expect(decodeOAuthState(`csrf123.google.${b64url(target)}`)).toEqual({ provider: "google", returnTo: target });
    });

    it("round-trips exactly what encodeOAuthState produced", () => {
        const target = "https://mail.mydomain.com/café/日本語?q=1&r=2";
        expect(decodeOAuthState(`csrf.${encodeOAuthState("apple", target)}`)).toEqual({ provider: "apple", returnTo: target });
    });

    it("has nothing to recover from a missing state or one with no '.' at all", () => {
        expect(decodeOAuthState(null)).toEqual({ provider: "", returnTo: null });
        expect(decodeOAuthState("")).toEqual({ provider: "", returnTo: null });
        expect(decodeOAuthState("csrf-only")).toEqual({ provider: "", returnTo: null });
    });

    it("keeps the provider but drops a return_to that isn't valid base64url", () => {
        expect(decodeOAuthState("csrf.google.!!!not-base64!!!")).toEqual({ provider: "google", returnTo: null });
    });

    it("drops a return_to that decodes to bytes that aren't valid UTF-8", () => {
        const invalid = Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url");
        expect(decodeOAuthState(`csrf.google.${invalid}`)).toEqual({ provider: "google", returnTo: null });
    });

    it("returns an empty return_to as-is when the encoded half is empty", () => {
        expect(decodeOAuthState("csrf.google.")).toEqual({ provider: "google", returnTo: "" });
    });
});
