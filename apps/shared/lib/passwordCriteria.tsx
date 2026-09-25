///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useMemo, useState } from "react";
import { getPasswordRequirements, PasswordRequirements } from "./api.js";

export interface PasswordCriterion {
    label: string;
    test: (password: string) => boolean;
}

// Used until `GET /secrets/password` resolves (or if it fails) so the checklist never just disappears.
// The server remains the source of truth either way — this only affects what the live checklist shows
// before/without a successful fetch, not what a submit is actually validated against.
export const FALLBACK_PASSWORD_REQUIREMENTS: PasswordRequirements = {
    min_length: 8,
    recommended_length: 32,
    require_lowercase: true,
    require_uppercase: true,
    require_numeral: true,
    require_special: true,
    special_chars: "!@#$%^&*_+?-",
};

/** Escapes characters that are special inside a `[...]` regex character class, for arbitrary `special_chars`. */
function escapeForCharClass(chars: string): string {
    return chars.replace(/[\\\]^-]/g, "\\$&");
}

export function buildPasswordCriteria(req: PasswordRequirements): PasswordCriterion[] {
    const criteria: PasswordCriterion[] = [
        { label: `At least ${req.min_length} characters`, test: (p) => p.length >= req.min_length },
    ];
    if (req.require_uppercase) {
        criteria.push({ label: "One uppercase letter (A-Z)", test: (p) => /[A-Z]/.test(p) });
    }
    if (req.require_lowercase) {
        criteria.push({ label: "One lowercase letter (a-z)", test: (p) => /[a-z]/.test(p) });
    }
    if (req.require_numeral) {
        criteria.push({ label: "One number (0-9)", test: (p) => /[0-9]/.test(p) });
    }
    if (req.require_special) {
        const regex = new RegExp(`[${escapeForCharClass(req.special_chars)}]`);
        criteria.push({ label: `One special character (${req.special_chars})`, test: (p) => regex.test(p) });
    }
    return criteria;
}

export function isPasswordValid(password: string, criteria: PasswordCriterion[]): boolean {
    return criteria.every((c) => c.test(password));
}

// Without the look-alikes (0/O, 1/l/I), since a generated password is often read out or retyped by a person.
const GENERATED_LOWER = "abcdefghijkmnopqrstuvwxyz";
const GENERATED_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const GENERATED_DIGITS = "23456789";
/** Long enough to be strong, short enough to read out; the server's own minimum wins when it's higher. */
const GENERATED_LENGTH = 16;

/** A uniformly random integer in `[0, max)`. Rejection sampling, so no value is likelier than another. */
function secureRandomInt(max: number): number {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do {
        globalThis.crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
}

/**
 * Generates a random password that satisfies `req` (see `buildPasswordCriteria()`), from the browser's
 * cryptographically secure random source. Always has at least one lowercase letter, uppercase letter and digit, and
 * one special character when `req` calls for them; special characters are left out when it doesn't, so a generated
 * password never contains one the server would refuse.
 */
export function generatePassword(req: PasswordRequirements): string {
    const groups = [GENERATED_LOWER, GENERATED_UPPER, GENERATED_DIGITS];
    if (req.require_special && req.special_chars.length > 0) {
        groups.push(req.special_chars);
    }
    const pool = groups.join("");
    const length = Math.max(req.min_length, GENERATED_LENGTH, groups.length);

    // One from each group so every requirement is met by construction, the rest from the whole pool...
    const chars = groups.map((g) => g[secureRandomInt(g.length)]);
    while (chars.length < length) {
        chars.push(pool[secureRandomInt(pool.length)]);
    }
    // ...then shuffled (Fisher-Yates) so the guaranteed ones aren't always at the front.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = secureRandomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
}

/**
 * Fetches the server's password requirements (falling back to `FALLBACK_PASSWORD_REQUIREMENTS` while
 * loading or if the request fails — the server remains the source of truth at submit time either way)
 * and derives the live criteria list from them. Shared by sign-up's profile step and account's
 * add-password form, which previously duplicated this fetch-and-memoize logic verbatim.
 */
export function usePasswordRequirements(): { requirements: PasswordRequirements; criteria: PasswordCriterion[] } {
    const [requirements, setRequirements] = useState<PasswordRequirements>(FALLBACK_PASSWORD_REQUIREMENTS);

    useEffect(() => {
        getPasswordRequirements()
            .then(setRequirements)
            .catch(() => {
                // Keep the fallback defaults — the server is still the source of truth at submit time.
            });
    }, []);

    const criteria = useMemo(() => buildPasswordCriteria(requirements), [requirements]);
    return { requirements, criteria };
}

export function PasswordCriteriaList({ password, criteria }: { password: string; criteria: PasswordCriterion[] }) {
    return (
        <ul className="rr-criteria">
            {criteria.map((c) => {
                const met = c.test(password);
                return (
                    <li key={c.label} className={"rr-criteria-item" + (met ? " rr-criteria-item--met" : "")}>
                        <span className="rr-criteria-icon" aria-hidden="true">
                            {met ? "✓" : ""}
                        </span>
                        {c.label}
                    </li>
                );
            })}
        </ul>
    );
}
