///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { RegistrationIdentifierType } from "./api.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9()\-.\s]+$/;
const MIN_PHONE_DIGITS = 7;

/**
 * Best-effort classification of a free-typed sign-in identifier as an e-mail address or phone number. Used
 * to decide whether an unrecognized identifier (no sign-in methods found) can be handed off to sign-up with
 * a prefilled, auto-sent verification step. Anything that matches neither (e.g. a username/account-ID
 * attempt) returns `undefined` — there's no contact value to seed sign-up's identifier step with, so it can
 * only start from scratch.
 */
export function guessIdentifierType(value: string): RegistrationIdentifierType | undefined {
    const trimmed = value.trim();
    if (EMAIL_RE.test(trimmed)) {
        return "email";
    }
    if (PHONE_RE.test(trimmed) && trimmed.replace(/[^0-9]/g, "").length >= MIN_PHONE_DIGITS) {
        return "phone";
    }
    return undefined;
}
