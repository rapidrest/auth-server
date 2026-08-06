///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import { guessIdentifierType } from "../../../apps/www/_lib/identifier.js";

describe("guessIdentifierType", () => {
    it("recognizes a plain e-mail address", () => {
        expect(guessIdentifierType("a@example.com")).toBe("email");
    });

    it("trims surrounding whitespace before classifying", () => {
        expect(guessIdentifierType("  a@example.com  ")).toBe("email");
    });

    it("recognizes an E.164-style phone number", () => {
        expect(guessIdentifierType("+15551234567")).toBe("phone");
    });

    it("recognizes a phone number with punctuation and spaces", () => {
        expect(guessIdentifierType("(555) 123-4567")).toBe("phone");
    });

    it("rejects a phone-shaped string with too few digits", () => {
        expect(guessIdentifierType("12345")).toBeUndefined();
    });

    it("returns undefined for a plain username/account ID", () => {
        expect(guessIdentifierType("coolusername")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(guessIdentifierType("")).toBeUndefined();
    });

    it("returns undefined for an e-mail-shaped string missing a domain dot", () => {
        expect(guessIdentifierType("a@localhost")).toBeUndefined();
    });
});
