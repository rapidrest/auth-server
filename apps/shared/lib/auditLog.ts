///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Human-readable presentation for `AuditLogEntry` (`adminApi.ts`): a clear, non-technical label per `type`
 * and per sign-in `method`, shared between the audit log's own admin page and the "Recent activity" card
 * on a user's detail page so both read identically.
 */
import { AuditLogEntry } from "./adminApi.js";

/**
 * One label per curated `type` value currently in use (see `AuditLogEntry`'s doc comment). Deliberately a
 * plain lookup rather than an exhaustive union/switch — an unrecognized future `type` falls back to the
 * raw string (see `auditLogTypeLabel()`) instead of failing to render.
 */
const AUDIT_LOG_TYPE_LABELS: Record<string, string> = {
    "auth.signed_in": "Signed in",
    "auth.impersonated": "Impersonated by an administrator",
    "auth.elevated": "Confirmed identity for a sensitive action",
    "auth.sessions_revoked": "Signed out everywhere",
    "auth.account.deleted": "Account deleted",
    "auth.registration.completed": "Registered",
    "auth.mfa.enrolled": "Added a second factor",
    "auth.mfa.removed": "Removed a second factor",
    "auth.password.changed": "Password changed",
    "auth.app_password.created": "App password created",
    "auth.app_password.removed": "App password removed",
    "auth.app_password.used": "Signed in with an app password",
    "auth.recovery_code.used": "Used a recovery code to sign in",
};

/** A clear, non-technical label for an audit log entry's `type`. Falls back to the raw value for a `type`
 * this list doesn't (yet) cover, so a new server-side event still renders as something rather than nothing. */
export function auditLogTypeLabel(type: string): string {
    return AUDIT_LOG_TYPE_LABELS[type] ?? type;
}

/** Every `type` value curated by the contract, in the order listed above — used to build the audit log
 * page's "Event" filter `<select>` without hard-coding the list a second time. */
export const KNOWN_AUDIT_LOG_TYPES: string[] = Object.keys(AUDIT_LOG_TYPE_LABELS);

/** One label per plain (unqualified) `method` value. Values qualified with a `:` (`"mfa:totp"`,
 * `"oidc:<provider>"`) are handled separately by `auditLogMethodLabel()`, which reuses this map for the
 * recognizable part of a qualified `mfa:` method. */
const AUDIT_LOG_METHOD_LABELS: Record<string, string> = {
    password: "password",
    "app-password": "an app password",
    mfa: "a second factor",
    passkey: "a passkey",
    fido2: "a security key",
    totp: "an authenticator app",
    otp: "a one-time code",
};

/**
 * A clear, non-technical label for a sign-in `method` string (only meaningful on `"auth.signed_in"`
 * entries), phrased to read naturally after "Signed in with"/"via". `method` is deliberately open-ended
 * (see `AuditLogEntry`'s doc comment) rather than an exhaustive union, so this never hard-codes the full
 * set:
 * - A plain recognized value (`"password"`, `"passkey"`, etc.) uses its label from the map above.
 * - A qualified `"mfa:<factor>"` (e.g. `"mfa:totp"`) labels the factor if recognized, else falls back to
 * the raw factor name — "a second factor (fido2)" rather than losing the detail entirely.
 * - A qualified `"oidc:<provider>"` becomes "single sign-on (<provider>)".
 * - Anything else — a future method this hasn't been taught about — is returned unchanged.
 * Returns `undefined` for an absent `method`, so a caller can decide whether to render anything at all.
 */
export function auditLogMethodLabel(method: string | undefined): string | undefined {
    if (!method) {
        return undefined;
    }
    if (AUDIT_LOG_METHOD_LABELS[method]) {
        return AUDIT_LOG_METHOD_LABELS[method];
    }
    const colon = method.indexOf(":");
    if (colon > 0) {
        const prefix = method.slice(0, colon);
        const rest = method.slice(colon + 1);
        if (prefix === "mfa") {
            return `a second factor (${AUDIT_LOG_METHOD_LABELS[rest] ?? rest})`;
        }
        if (prefix === "oidc") {
            return `single sign-on (${rest})`;
        }
    }
    return method;
}

/**
 * The full label shown for one entry's "Event" column/field: the `type` label, plus — only for
 * `"auth.signed_in"` entries with a `method` — the method folded in parenthetically, e.g. "Signed in
 * (a passkey)". Every other `type` ignores `method` even if present, since the contract only calls it
 * meaningful for `auth.signed_in`.
 */
export function auditLogEventLabel(entry: Pick<AuditLogEntry, "type" | "method">): string {
    const base = auditLogTypeLabel(entry.type);
    if (entry.type === "auth.signed_in") {
        const methodLabel = auditLogMethodLabel(entry.method);
        if (methodLabel) {
            return `${base} (${methodLabel})`;
        }
    }
    return base;
}

/**
 * A compact, single-line rendering of an entry's free-form `data` for an inline "Detail" table cell — e.g.
 * `hint: Mail client, ip: 1.2.3.4`. Returns an empty string when there's nothing to show (no `data`, or an
 * empty object), which callers render as an em dash the same way an empty `ip`/`actorUid` already is.
 */
export function formatAuditLogData(data: Record<string, unknown> | undefined): string {
    if (!data) {
        return "";
    }
    const entries = Object.entries(data);
    if (entries.length === 0) {
        return "";
    }
    return entries.map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(", ");
}
