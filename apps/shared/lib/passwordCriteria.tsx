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
