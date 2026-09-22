///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { toAppUrl } from "../src/routes/AppUrl.js";

describe("toAppUrl()", () => {
    it("keeps an absolute http(s) URL exactly as written, path and query included", () => {
        expect(toAppUrl("https://mail.mydomain.com")).toBe("https://mail.mydomain.com");
        expect(toAppUrl("http://localhost:3000/inbox?tab=1")).toBe("http://localhost:3000/inbox?tab=1");
    });

    it("trims surrounding whitespace", () => {
        expect(toAppUrl("  https://mail.mydomain.com/  ")).toBe("https://mail.mydomain.com/");
    });

    it("returns an empty string when unset or blank", () => {
        expect(toAppUrl(undefined)).toBe("");
        expect(toAppUrl("")).toBe("");
        expect(toAppUrl("   ")).toBe("");
    });

    it("returns an empty string for anything that isn't a string", () => {
        expect(toAppUrl(42)).toBe("");
        expect(toAppUrl(null)).toBe("");
        expect(toAppUrl(["https://a.com"])).toBe("");
    });

    it("rejects relative paths and bare hostnames, which aren't absolute URLs", () => {
        expect(toAppUrl("/app")).toBe("");
        expect(toAppUrl("mail.mydomain.com")).toBe("");
    });

    it("rejects non-http(s) schemes", () => {
        expect(toAppUrl("javascript:alert(1)")).toBe("");
        expect(toAppUrl("data:text/html,x")).toBe("");
        expect(toAppUrl("ftp://mail.mydomain.com")).toBe("");
    });
});
