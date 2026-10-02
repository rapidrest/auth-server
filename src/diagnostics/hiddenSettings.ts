///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////

/**
 * The settings whose value the Diagnostics never shows, listed by name. Only a name on this list is hidden: every other
 * environment variable and setting is shown, so what is hidden is a decision someone made, not a guess from the look of a name.
 * That puts the upkeep here: a new secret in the server or in `@rapidrest/auth` is added below.
 *
 * A name is written as the configuration key (`a:b:c`). The environment spells the same setting `a__b__c`, and the comparison
 * ignores case, so one entry covers both. An entry also hides everything beneath it (`default_accounts` hides each key of it).
 *
 * What is shown is still scrubbed by value (`scrubValue()` in redaction.ts): a URL's `user:password@`, a private key, a JWT,
 * a `Bearer` token or a `password=...` pair are removed or hide the whole value, under any name.
 */
export const CORE_HIDDEN_SETTINGS: readonly string[] = [
    // The signing and session secrets.
    "auth:secret",
    "cookie_secret",
    "session:secret",
    "default_accounts",
    // Encrypts the OAuth signing keys and the messaging secrets at rest.
    "auth:oauth_server:keys:encryption_key",
    // Encrypts every user's TOTP/MFA shared secret at rest (AES-256-GCM); with the DB it clones every second factor.
    "auth:totp:encryption_key",
    // The sign-in providers' application secrets and Apple's signing key.
    "auth:google:clientSecret",
    "auth:microsoft:clientSecret",
    "auth:facebook:clientSecret",
    "auth:apple:privateKey",
    // The messaging credentials: SMTP, SMS (Twilio, Telnyx) and WhatsApp.
    "smtp_config:auth:pass",
    "sms_config:config:token",
    "sms_config:config:apiKey",
    "whatsapp:accessToken",
    // The datastores' passwords, for a deployment that sets one apart from the URL (the URL's own credentials are scrubbed).
    "datastores:acl:password",
    "datastores:cache:password",
    "datastores:events:password",
    "datastores:events_publish:password",
    "datastores:logs:password",
    "datastores:mongo:password",
    "datastores:sql:password",
];

/** `a__b__C` and `a:b:c` are the same setting. */
function normalize(name: string): string {
    return name.trim().toLowerCase().replace(/__/g, ":");
}

/** Whether the value of the environment variable or setting `name` is hidden: it, or a setting above it, is on the list. */
export function isHiddenSetting(name: string): boolean {
    const normalized: string = normalize(name);
    return CORE_HIDDEN_SETTINGS.some((entry) => {
        const listed: string = normalize(entry);
        return normalized === listed || normalized.startsWith(`${listed}:`);
    });
}
