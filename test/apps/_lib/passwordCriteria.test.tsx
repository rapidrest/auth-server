// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordRequirements } from "../../../apps/shared/lib/api.js";
import {
    buildPasswordCriteria,
    FALLBACK_PASSWORD_REQUIREMENTS,
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
