///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { DiscoverResult } from "../../lib/api.js";

export type Step = "identifier" | "methods" | "challenge" | "mfa" | "oauth";
export type FixedMethod = "passkey" | "password" | "totp" | "fido2";
export type Method = FixedMethod | "otp";
export type OtpHint = DiscoverResult["otp"][number];

export type MethodListItem = { kind: "fixed"; method: FixedMethod } | { kind: "otp"; hint: OtpHint };

// Passkey listed first to mirror how other providers surface a configured passkey as the recommended option.
export const FIXED_METHOD_LABELS: Record<FixedMethod, string> = {
    passkey: "Passkey",
    password: "Password",
    totp: "Authenticator app",
    fido2: "Hardware key",
};

export const CONTACT_TYPE_LABELS: Record<OtpHint["type"], string> = {
    email: "Email",
    phone: "Phone",
};

/**
 * The label for an OTP hint's method. A WhatsApp hint shares its phone's `type` (and obfuscated contact)
 * with the SMS hint, so the channel — not the type — decides which label it gets.
 */
export function otpHintLabel(hint: OtpHint): string {
    return hint.channel === "whatsapp" ? "WhatsApp" : CONTACT_TYPE_LABELS[hint.type];
}

/** A stable unique key for an OTP hint — includes the channel so a phone's SMS and WhatsApp hints don't collide. */
export function otpHintKey(hint: OtpHint): string {
    return `otp-${hint.type}-${hint.channel ?? "default"}-${hint.contact}`;
}

export const EMPTY_DISCOVER: DiscoverResult = { password: false, totp: false, passkey: false, fido2: false, otp: [] };

// One list item per discovered OTP-eligible contact — each is its own selectable sign-in method, not a
// single combined "One-time code" entry, so the user can tell which contact a code would go to before picking it.
export function buildMethodList(discover: DiscoverResult): MethodListItem[] {
    const items: MethodListItem[] = [];
    if (discover.passkey) items.push({ kind: "fixed", method: "passkey" });
    if (discover.password) items.push({ kind: "fixed", method: "password" });
    if (discover.totp) items.push({ kind: "fixed", method: "totp" });
    for (const hint of discover.otp) {
        items.push({ kind: "otp", hint });
    }
    if (discover.fido2) items.push({ kind: "fixed", method: "fido2" });
    return items;
}
