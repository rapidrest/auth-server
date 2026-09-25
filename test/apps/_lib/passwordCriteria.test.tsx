// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordRequirements } from "../../../apps/shared/lib/api.js";
import {
    buildPasswordCriteria,
    FALLBACK_PASSWORD_REQUIREMENTS,
    generatePassword,
    isPasswordValid,
    PasswordCriteriaList,
} from "../../../apps/shared/lib/passwordCriteria.js";

const FULL_REQUIREMENTS: PasswordRequirements = FALLBACK_PASSWORD_REQUIREMENTS;

const MIN_LENGTH_ONLY_REQUIREMENTS: PasswordRequirements = {
    min_length: 8,
    recommended_length: 32,
    require_lowercase: false,
    require_uppercase: false,
    require_numeral: false,
    require_special: false,
    special_chars: "!@#$%^&*_+?-",
};

describe("buildPasswordCriteria", () => {
    it("always includes the minimum-length criterion", () => {
        const criteria = buildPasswordCriteria(MIN_LENGTH_ONLY_REQUIREMENTS);
        expect(criteria).toHaveLength(1);
        expect(criteria[0].label).toBe("At least 8 characters");
        expect(criteria[0].test("1234567")).toBe(false);
        expect(criteria[0].test("12345678")).toBe(true);
    });

    it("adds a criterion per enabled requirement, each testing correctly", () => {
        const criteria = buildPasswordCriteria(FULL_REQUIREMENTS);
        expect(criteria).toHaveLength(5);

        const uppercase = criteria.find((c) => c.label.includes("uppercase"))!;
        expect(uppercase.test("abc")).toBe(false);
        expect(uppercase.test("Abc")).toBe(true);

        const lowercase = criteria.find((c) => c.label.includes("lowercase"))!;
        expect(lowercase.test("ABC")).toBe(false);
        expect(lowercase.test("aBC")).toBe(true);

        const numeral = criteria.find((c) => c.label.includes("number"))!;
        expect(numeral.test("abc")).toBe(false);
        expect(numeral.test("abc1")).toBe(true);

        const special = criteria.find((c) => c.label.includes("special"))!;
        expect(special.test("abc")).toBe(false);
        expect(special.test("abc!")).toBe(true);
    });

    it("escapes regex-special characters in special_chars (]^-\\) safely", () => {
        const req: PasswordRequirements = { ...MIN_LENGTH_ONLY_REQUIREMENTS, require_special: true, special_chars: "]^-\\" };
        const criteria = buildPasswordCriteria(req);
        const special = criteria.find((c) => c.label.includes("special"))!;
        expect(special.test("abc")).toBe(false);
        expect(special.test("abc]")).toBe(true);
        expect(special.test("abc^")).toBe(true);
        expect(special.test("abc-")).toBe(true);
        expect(special.test("abc\\")).toBe(true);
    });
});

describe("generatePassword", () => {
    const VARIANTS: [string, PasswordRequirements][] = [
        ["the defaults", FULL_REQUIREMENTS],
        ["length only", MIN_LENGTH_ONLY_REQUIREMENTS],
        ["a long minimum", { ...FULL_REQUIREMENTS, min_length: 40 }],
        ["an unusual special set", { ...FULL_REQUIREMENTS, special_chars: "]^-\\" }],
        ["only lowercase and numbers required", { ...MIN_LENGTH_ONLY_REQUIREMENTS, require_lowercase: true, require_numeral: true }],
    ];

    it.each(VARIANTS)("always satisfies the requirements (%s)", (_name, req) => {
        const criteria = buildPasswordCriteria(req);
        for (let i = 0; i < 200; i++) {
            const generated = generatePassword(req);
            expect(isPasswordValid(generated, criteria)).toBe(true);
            expect(generated.length).toBeGreaterThanOrEqual(req.min_length);
        }
    });

    it("is 16 characters unless the server's minimum is longer", () => {
        expect(generatePassword(FULL_REQUIREMENTS)).toHaveLength(16);
        expect(generatePassword({ ...FULL_REQUIREMENTS, min_length: 40 })).toHaveLength(40);
    });

    it("leaves out special characters when they aren't required, and look-alike characters always", () => {
        for (let i = 0; i < 200; i++) {
            expect(generatePassword(MIN_LENGTH_ONLY_REQUIREMENTS)).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
        }
    });

    it("uses only the configured special characters", () => {
        const req = { ...FULL_REQUIREMENTS, special_chars: "#" };
        for (let i = 0; i < 100; i++) {
            expect(generatePassword(req)).toMatch(/^[a-km-zA-HJ-NP-Z2-9#]+$/);
        }
    });

    it("doesn't repeat itself, and puts the guaranteed characters in different places", () => {
        const seen = new Set(Array.from({ length: 50 }, () => generatePassword(FULL_REQUIREMENTS)));
        expect(seen.size).toBe(50);
        const firstChars = new Set(Array.from({ length: 200 }, () => generatePassword(FULL_REQUIREMENTS)[0]));
        expect(firstChars.size).toBeGreaterThan(10);
    });

    it("gets every random number from the secure source, without bias", () => {
        // A value in the biased tail of the uint32 range must be rejected, not folded into the result.
        const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
        generatePassword(FULL_REQUIREMENTS);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();

        const max = 25;
        const limit = Math.floor(0x100000000 / max) * max;
        const values = [0xffffffff, limit, 7];
        const stub = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((buf: Uint32Array) => {
            buf[0] = values.length > 1 ? values.shift()! : values[0];
            return buf;
        }) as any);
        // Every draw here is either rejected (>= limit) or 7, so all 16 characters come from index 7 (mod group size).
        const generated = generatePassword({ ...MIN_LENGTH_ONLY_REQUIREMENTS, min_length: 8 });
        stub.mockRestore();
        expect(generated).toHaveLength(16);
    });
});

describe("isPasswordValid", () => {
    it("is true only when every criterion passes", () => {
        const criteria = buildPasswordCriteria(FULL_REQUIREMENTS);
        expect(isPasswordValid("short", criteria)).toBe(false);
        expect(isPasswordValid("LongEnough1!", criteria)).toBe(true);
    });
});

describe("PasswordCriteriaList", () => {
    it("renders a checkmark for met criteria and none for unmet ones", () => {
        const criteria = buildPasswordCriteria(FULL_REQUIREMENTS);
        render(<PasswordCriteriaList password="abcdefgh" criteria={criteria} />);

        const lengthItem = screen.getByText("At least 8 characters").closest("li")!;
        expect(lengthItem.className).toContain("rr-criteria-item--met");
        expect(lengthItem.querySelector(".rr-criteria-icon")?.textContent).toBe("✓");

        const uppercaseItem = screen.getByText("One uppercase letter (A-Z)").closest("li")!;
        expect(uppercaseItem.className).not.toContain("rr-criteria-item--met");
        expect(uppercaseItem.querySelector(".rr-criteria-icon")?.textContent).toBe("");
    });
});
