///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    auditLogEventLabel,
    auditLogMethodLabel,
    auditLogTypeLabel,
    formatAuditLogData,
    KNOWN_AUDIT_LOG_TYPES,
} from "../../../apps/shared/lib/auditLog.js";

describe("auditLogTypeLabel", () => {
    it("labels every known type curated by the contract", () => {
        expect(auditLogTypeLabel("auth.signed_in")).toBe("Signed in");
        expect(auditLogTypeLabel("auth.impersonated")).toBe("Impersonated by an administrator");
        expect(auditLogTypeLabel("auth.elevated")).toBe("Confirmed identity for a sensitive action");
        expect(auditLogTypeLabel("auth.sessions_revoked")).toBe("Signed out everywhere");
        expect(auditLogTypeLabel("auth.account.deleted")).toBe("Account deleted");
        expect(auditLogTypeLabel("auth.registration.completed")).toBe("Registered");
        expect(auditLogTypeLabel("auth.mfa.enrolled")).toBe("Added a second factor");
        expect(auditLogTypeLabel("auth.mfa.removed")).toBe("Removed a second factor");
        expect(auditLogTypeLabel("auth.password.changed")).toBe("Password changed");
        expect(auditLogTypeLabel("auth.app_password.created")).toBe("App password created");
        expect(auditLogTypeLabel("auth.app_password.removed")).toBe("App password removed");
        expect(auditLogTypeLabel("auth.app_password.used")).toBe("Signed in with an app password");
        expect(auditLogTypeLabel("auth.recovery_code.used")).toBe("Used a recovery code to sign in");
    });

    it("falls back to the raw string for an unrecognized type", () => {
        expect(auditLogTypeLabel("auth.something_new")).toBe("auth.something_new");
    });
});

describe("KNOWN_AUDIT_LOG_TYPES", () => {
    it("lists exactly the thirteen curated types, with no duplicates", () => {
        expect(KNOWN_AUDIT_LOG_TYPES).toHaveLength(13);
        expect(new Set(KNOWN_AUDIT_LOG_TYPES).size).toBe(13);
        expect(KNOWN_AUDIT_LOG_TYPES).toContain("auth.signed_in");
        expect(KNOWN_AUDIT_LOG_TYPES).toContain("auth.recovery_code.used");
    });
});

describe("auditLogMethodLabel", () => {
    it("returns undefined for an absent method", () => {
        expect(auditLogMethodLabel(undefined)).toBeUndefined();
    });

    it("labels every plain recognized method", () => {
        expect(auditLogMethodLabel("password")).toBe("password");
        expect(auditLogMethodLabel("app-password")).toBe("an app password");
        expect(auditLogMethodLabel("mfa")).toBe("a second factor");
        expect(auditLogMethodLabel("passkey")).toBe("a passkey");
        expect(auditLogMethodLabel("fido2")).toBe("a security key");
        expect(auditLogMethodLabel("totp")).toBe("an authenticator app");
        expect(auditLogMethodLabel("otp")).toBe("a one-time code");
    });

    it("labels a qualified mfa:<factor> method using the factor's own label", () => {
        expect(auditLogMethodLabel("mfa:totp")).toBe("a second factor (an authenticator app)");
        expect(auditLogMethodLabel("mfa:fido2")).toBe("a second factor (a security key)");
    });

    it("falls back to the raw factor name for an unrecognized mfa: factor", () => {
        expect(auditLogMethodLabel("mfa:webauthn-platform")).toBe("a second factor (webauthn-platform)");
    });

    it("labels a qualified oidc:<provider> method with the provider name", () => {
        expect(auditLogMethodLabel("oidc:google")).toBe("single sign-on (google)");
    });

    it("returns an unrecognized plain method unchanged", () => {
        expect(auditLogMethodLabel("smart-card")).toBe("smart-card");
    });

    it("returns an unrecognized qualified method (unknown prefix) unchanged", () => {
        expect(auditLogMethodLabel("saml:okta")).toBe("saml:okta");
    });

    it("treats a leading colon as an unrecognized plain method rather than a qualified one", () => {
        // indexOf(":") === 0 fails the `colon > 0` guard, so this never reaches the prefix branches.
        expect(auditLogMethodLabel(":totp")).toBe(":totp");
    });
});

describe("auditLogEventLabel", () => {
    it("folds a signed-in entry's method into its label", () => {
        expect(auditLogEventLabel({ type: "auth.signed_in", method: "passkey" })).toBe("Signed in (a passkey)");
    });

    it("omits the parenthetical when a signed-in entry has no method", () => {
        expect(auditLogEventLabel({ type: "auth.signed_in" })).toBe("Signed in");
    });

    it("ignores method on every other type, even if present", () => {
        expect(auditLogEventLabel({ type: "auth.mfa.enrolled", method: "totp" })).toBe("Added a second factor");
    });
});

describe("formatAuditLogData", () => {
    it("returns an empty string for undefined or empty data", () => {
        expect(formatAuditLogData(undefined)).toBe("");
        expect(formatAuditLogData({})).toBe("");
    });

    it("joins string values verbatim and non-string values as JSON", () => {
        expect(formatAuditLogData({ hint: "Mail client", count: 3, ok: true })).toBe(
            'hint: Mail client, count: 3, ok: true',
        );
    });
});
