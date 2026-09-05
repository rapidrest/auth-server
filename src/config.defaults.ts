///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Default secret values used by `config.sql.ts`/`config.mongo.ts` for local development convenience.
 * Shared here (rather than duplicated in each config file) so `assertProductionSecretsAreSet()` can
 * compare the effective runtime config against the exact same values it's guarding against in
 * production.
 */
export const DEFAULT_COOKIE_SECRET = "f0fLSKFJLKWJFe09f32joff098u2fOFIWJ32890fnfnlak";
export const DEFAULT_AUTH_SECRET = "MyPasswordIsSecure";
export const DEFAULT_SESSION_SECRET = "SessionsHaveSecrets";
/** Placeholder Google OAuth/OIDC credentials — `config.sql.ts`/`config.mongo.ts` and `AuthGoogleRoute`
 * share these so `assertProductionSecretsAreSet()` can recognize them. */
export const DEFAULT_GOOGLE_CLIENT_ID = "123457890.apps.googleusercontent.com";
export const DEFAULT_GOOGLE_CLIENT_SECRET = "f32fa983732aq9rf7ab39f";
/** Placeholder Microsoft Entra ID (Azure AD) application credentials, plus the multi-tenant `common`
 * authority — see the doc comment on `AuthMicrosoftRoute.tenant` for why a real deployment must
 * override the tenant with a concrete tenant ID/GUID rather than leaving it at `common`. */
export const DEFAULT_MICROSOFT_CLIENT_ID = "00000000-0000-0000-0000-000000000000";
export const DEFAULT_MICROSOFT_CLIENT_SECRET = "f32fa983732aq9rf7ab39f";
export const DEFAULT_MICROSOFT_TENANT = "common";
/** Placeholder Sign in with Apple credentials. Unlike the other providers, Apple's `client_secret` is
 * not a static shared secret but a JWT that `AuthAppleRoute` signs itself using `privateKey` — this is
 * a syntactically valid (but publicly known, non-functional) EC private key so signing doesn't throw
 * before an operator has configured a real one. */
export const DEFAULT_APPLE_CLIENT_ID = "com.example.rapidrest.auth-server";
export const DEFAULT_APPLE_TEAM_ID = "AAPLTEAMID01";
export const DEFAULT_APPLE_KEY_ID = "AAPLKEYID01";
export const DEFAULT_APPLE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgURaDmC9zCJXKH+6z
DE4CeQrE8aibsDjjQI7t2eOJLZ+hRANCAAT9l9H5w8oyl79ekU2eNVXyY198Pq5y
zZvwdJPaqYxCEXrMfzDL+Z2zbs7tiSka1ab6dG5FH3pPrFcqC36TfbGf
-----END PRIVATE KEY-----`;
/** Placeholder Facebook Login app credentials (Facebook calls these "App ID"/"App Secret") —
 * `config.sql.ts`/`config.mongo.ts` and `AuthFacebookRoute` share these so
 * `assertProductionSecretsAreSet()` can recognize them. */
export const DEFAULT_FACEBOOK_CLIENT_ID = "1234567890123456";
export const DEFAULT_FACEBOOK_CLIENT_SECRET = "f32fa983732aq9rf7ab39f";
/** Placeholder AES-256 key (64 hex chars) used to encrypt OAuth authorization-server signing key private
 * material at rest (see `SigningKeyUtils`). Like `DEFAULT_AUTH_SECRET`/etc. above, this is a real secret
 * (not a third-party placeholder), so `assertProductionSecretsAreSet()` hard-fails on it in production. */
export const DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY = "96aa4879e304e525b74141bf1bc072c17e2b90c5b35250a2d18cbd2b8d4172ac";

/** Minimal shape of the `nconf` config object this guard needs — matches `config.sql.ts`/`config.mongo.ts`'s export. */
export interface SecretsConfig {
    get(key: string): unknown;
}

/**
 * Refuses to let the server start in production with any of the checked-in development default
 * secrets (`cookie_secret`, `auth:secret`, `session:secret`) still in effect — they're visible to
 * anyone who reads this public repo, so leaving one unset in production would let an attacker forge
 * JWTs/sessions/cookies outright.
 *
 * @param config The loaded runtime configuration to check.
 * @param environment The deployment environment (typically `process.env.environment`). A no-op unless
 * this is exactly `"production"`.
 * @throws If any of the guarded secrets still hold its known default value in production.
 */
export function assertProductionSecretsAreSet(config: SecretsConfig, environment: string | undefined): void {
    if (environment !== "production") {
        return;
    }

    const insecureDefaults: Array<{ envVar: string; value: unknown; expected: string }> = [
        { envVar: "COOKIE_SECRET", value: config.get("cookie_secret"), expected: DEFAULT_COOKIE_SECRET },
        { envVar: "AUTH__SECRET", value: config.get("auth:secret"), expected: DEFAULT_AUTH_SECRET },
        { envVar: "SESSION__SECRET", value: config.get("session:secret"), expected: DEFAULT_SESSION_SECRET },
        {
            envVar: "AUTH__OAUTH_SERVER__KEYS__ENCRYPTION_KEY",
            value: config.get("auth:oauth_server:keys:encryption_key"),
            expected: DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY,
        },
    ].filter((entry) => entry.value === entry.expected);

    if (insecureDefaults.length > 0) {
        const names: string = insecureDefaults.map((entry) => entry.envVar).join(", ");
        throw new Error(
            `Refusing to start in production with the default development secret(s) still in effect: ${names}. ` +
                "Set the corresponding environment variable(s) to a unique, secret value before deploying.",
        );
    }

    // The shipped Google/Microsoft/Apple provider configs point at non-functional placeholder
    // credentials, so unlike the secrets above they can't be used to forge anything — but starting
    // successfully while silently unable to complete a real sign-in is still a trap for an operator
    // who enabled a provider and forgot to override its placeholder. A warning rather than a hard
    // failure, since (unlike the three secrets above) these routes are always mounted regardless of
    // whether the deployment actually uses any of them.
    const providerPlaceholders: string[] = [
        config.get("auth:google:clientID") === DEFAULT_GOOGLE_CLIENT_ID ? "AUTH__GOOGLE__CLIENTID" : undefined,
        config.get("auth:google:clientSecret") === DEFAULT_GOOGLE_CLIENT_SECRET
            ? "AUTH__GOOGLE__CLIENTSECRET"
            : undefined,
        config.get("auth:microsoft:clientID") === DEFAULT_MICROSOFT_CLIENT_ID
            ? "AUTH__MICROSOFT__CLIENTID"
            : undefined,
        config.get("auth:microsoft:clientSecret") === DEFAULT_MICROSOFT_CLIENT_SECRET
            ? "AUTH__MICROSOFT__CLIENTSECRET"
            : undefined,
        config.get("auth:microsoft:tenant") === DEFAULT_MICROSOFT_TENANT ? "AUTH__MICROSOFT__TENANT" : undefined,
        config.get("auth:apple:clientID") === DEFAULT_APPLE_CLIENT_ID ? "AUTH__APPLE__CLIENTID" : undefined,
        config.get("auth:apple:teamId") === DEFAULT_APPLE_TEAM_ID ? "AUTH__APPLE__TEAMID" : undefined,
        config.get("auth:apple:keyId") === DEFAULT_APPLE_KEY_ID ? "AUTH__APPLE__KEYID" : undefined,
        config.get("auth:apple:privateKey") === DEFAULT_APPLE_PRIVATE_KEY ? "AUTH__APPLE__PRIVATEKEY" : undefined,
        config.get("auth:facebook:clientID") === DEFAULT_FACEBOOK_CLIENT_ID ? "AUTH__FACEBOOK__CLIENTID" : undefined,
        config.get("auth:facebook:clientSecret") === DEFAULT_FACEBOOK_CLIENT_SECRET
            ? "AUTH__FACEBOOK__CLIENTSECRET"
            : undefined,
    ].filter((entry): entry is string => entry !== undefined);

    if (providerPlaceholders.length > 0) {
        console.warn(
            `WARNING: starting in production with the default placeholder OAuth/OIDC credential(s) still ` +
                `in effect: ${providerPlaceholders.join(", ")}. Sign-in with the affected provider(s) will not ` +
                "work until these are set to your real values. If you don't use that provider, this can be ignored.",
        );
    }
}
