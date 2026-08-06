import { DiscoverResult } from "../../lib/api.js";

export type Step = "identifier" | "methods" | "challenge";
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
