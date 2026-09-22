///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import nconf from "nconf";
import {
    DEFAULT_AUTH_SECRET,
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_APPLE_KEY_ID,
    DEFAULT_APPLE_PRIVATE_KEY,
    DEFAULT_APPLE_TEAM_ID,
    DEFAULT_COOKIE_SECRET,
    DEFAULT_FACEBOOK_CLIENT_ID,
    DEFAULT_FACEBOOK_CLIENT_SECRET,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_GOOGLE_CLIENT_SECRET,
    DEFAULT_MICROSOFT_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_SECRET,
    DEFAULT_MICROSOFT_TENANT,
    DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY,
    DEFAULT_SESSION_SECRET,
} from "./config.defaults.js";
import { DEFAULT_MESSAGE_TEMPLATES } from "./config.templates.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const _require = createRequire(import.meta.url);
const packageInfo = _require(join(process.cwd(), "package.json"));

const conf = nconf
    .argv()
    .env({
        separator: "__",
        parseValues: true,
    });

conf.use("memory");

conf.defaults({
    service_name: packageInfo.name,
    version: packageInfo.version,
    base_path: join(_dirname, "mongo"),
    cookie_secret: DEFAULT_COOKIE_SECRET,
    cors: {
        origins: ["http://localhost:3000"],
    },
    datastores: {
        acl: {
            type: "mongodb",
            url: "mongodb://localhost:9999/acls",
            database: "rrst_acls",
            synchronize: true,
        },
        cache: {
            type: "redis",
            url: "redis://localhost",
        },
        events: {
            type: "redis",
            url: "redis://localhost"
        },
        logs: {
            type: "redis",
            url: "redis://localhost"
        },
        mongo: {
            type: "mongodb",
            host: "localhost",
            port: 9999,
            database: "rrst_auth",
            synchronize: true,
        }
    },
    // Specifies the group names that are considered to be trusted with administrative privileges.
    trusted_roles: ["admin"],
    react: {
        // Path to the Vite manifest produced by `rapidrest build`, used to resolve hashed
        // client bundle URLs for hydrated pages (see apps/www, apps/admin).
        manifestPath: "dist/public/.vite/manifest.json",
    },
    // Settings pertaining to the signing and verification of authentication tokens
    auth: {
        // Set to `true` to allow new account registration, otherwise set to `false`.
        allowRegistration: true,
        // The default authentication strategy to use
        strategy: "auth.JWTStrategy",
        allowQueryParam: true,
        // The default set of scopes to grant newly authenticated users
        default_scopes: ["profile:contacts", "profile:preferences"],
        // The password to be used when signing or verifying authentication tokens
        secret: DEFAULT_AUTH_SECRET,
        // Set to `true` to force multi-factor authentication for every account regardless of its own
        // `requireMFA` value. Seeds the runtime `SystemSettings.requireMFA` (see `BaseUserRoute.validateCreate`/
        // `validateUpdate` and `AuthMFARoute`, which drives `MFAStrategyOptions.require2FA` from that same
        // setting) the first time it's read — from then on, an admin can change it via `PUT /api/settings`
        // without touching this file.
        requireMFA: false,
        // Also set a Set-Cookie header (in addition to returning the token in the response body)
        // whenever a JWT is issued, so the SSR pages under apps/www can authenticate a request without
        // the client having to attach an Authorization header itself. HttpOnly (the default) so the
        // token isn't reachable from JavaScript. `access.maxAge`/`refresh.maxAge` match
        // `options.expiresIn`/`refresh.expiresIn` below. Neither `access` nor `refresh` sets `secure`
        // here, so `TokenUtils.buildCookie()`'s default applies: the `Secure` attribute is included
        // unless `secure: false` is explicitly set. Browsers treat `http://localhost` as a trustworthy
        // origin, so this default also works for local dev without changes — only set `secure: false`
        // below if you need cookie persistence on a plain-HTTP origin that ISN'T `localhost` (e.g. a LAN
        // IP or a non-TLS staging host), and never do so for a real production deployment.
        //
        // Neither cookie sets a `domain`, so both are host-only: the browser returns them to exactly the host
        // that issued them. To share the session with sibling apps (this server on `auth.mydomain.com`, a
        // downstream app on `mail.mydomain.com`), set `domain` on BOTH `access` and `refresh` to the shared
        // parent, e.g. `auth__cookie__access__domain=.mydomain.com` and `auth__cookie__refresh__domain=.mydomain.com`.
        // Every subdomain under it then receives the session cookies, so only do this when all of them are trusted.
        cookie: {
            enabled: true,
            access: { name: "jwt", maxAge: 60 * 60 },
            refresh: { name: "refresh", maxAge: 60 * 60 * 24 * 14 },
        },
        options: {
            // "algorithm": "HS256",
            expiresIn: "1 hour",
            audience: "mydomain.com",
            issuer: "api.mydomain.com",
        },
        // Refresh tokens are long-lived — a client exchanges one (via `POST /auth/refresh`) for a fresh
        // access/refresh pair before the short-lived access token above expires.
        refresh: {
            expiresIn: "14 days",
        },
        google: {
            clientID: DEFAULT_GOOGLE_CLIENT_ID,
            clientSecret: DEFAULT_GOOGLE_CLIENT_SECRET,
            // Points at the frontend sign-in page (not this API route) — see AuthGoogleRoute's own
            // redirectURI doc comment for why.
            redirectURI: "http://localhost:3000/auth/signin",
        },
        microsoft: {
            tenant: DEFAULT_MICROSOFT_TENANT,
            clientID: DEFAULT_MICROSOFT_CLIENT_ID,
            clientSecret: DEFAULT_MICROSOFT_CLIENT_SECRET,
            redirectURI: "http://localhost:3000/auth/signin",
        },
        apple: {
            clientID: DEFAULT_APPLE_CLIENT_ID,
            teamId: DEFAULT_APPLE_TEAM_ID,
            keyId: DEFAULT_APPLE_KEY_ID,
            privateKey: DEFAULT_APPLE_PRIVATE_KEY,
            redirectURI: "http://localhost:3000/auth/signin",
        },
        facebook: {
            clientID: DEFAULT_FACEBOOK_CLIENT_ID,
            clientSecret: DEFAULT_FACEBOOK_CLIENT_SECRET,
            redirectURI: "http://localhost:3000/auth/signin",
        },
        passkey: {
            rpName: "rapidrest",
            rpID: "localhost",
            origin: "http://localhost:3000",
        },
        fido2: {
            rpName: "rapidrest",
            rpID: "localhost",
            origin: "http://localhost:3000",
            authenticatorAttachment: "cross-platform",
            residentKey: "discouraged",
        },
        totp: {
            issuer: "rapidrest",
            digits: 6,
            period: 30,
            algorithm: "sha1",
            epochTolerance: [5, 0],
        },
        // Settings for this deployment acting as its own OAuth 2.0 / OpenID Connect authorization
        // server (as opposed to the `google`/`microsoft`/`apple`/`facebook` blocks above, which are
        // this app acting as a *relying party* against someone else's IdP).
        oauth_server: {
            // This server's own public origin — stamped into every issued token's `iss` claim and
            // used to build the absolute endpoint URLs in the discovery document. Must be overridden
            // to the deployment's real public base URL; the default matches `rapidrest dev`'s
            // first-choice port.
            issuer: "http://localhost:3001",
            keys: {
                // 64-character hex AES-256 key encrypting signing-key private material at rest. Real
                // secret, not a placeholder — see `DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY`'s own doc
                // comment and `assertProductionSecretsAreSet()`.
                encryption_key: DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY,
                rotationIntervalDays: 30,
                retirementGraceDays: 7,
            },
            codeTTL: "60s",
            consentTicketTTL: "10m",
            accessTokenTTL: "15m",
            idTokenTTL: "15m",
            refreshTokenTTL: "30d",
            supportedScopes: ["openid", "profile", "email", "phone", "offline_access"],
        },
    },
    class_loader: {
        ignore: [
            /server\..*/,
            /config\..*/
        ]
    },
    oauth_provider: {
        name: "oauth_test",
        /** STUB: Will be filled out by test. */
    },
    rbac: {
        enabled: true,
    },
    session: {
        secret: DEFAULT_SESSION_SECRET,
        cookieName: "rrst.sid",
        // Must cover the refresh token's lifetime (`auth:refresh:expiresIn` above): `BaseAuthRefreshRoute`
        // validates a refresh token against `req.session.refreshUid`, and `MFAStrategy` similarly keys
        // its challenge/verify phases off session state. The store's TTL is refreshed (rolling) on every
        // request that touches the session, but a value shorter than the refresh token's own lifetime
        // would let the session (and so the refresh token's ability to be redeemed) expire first.
        ttl: 60 * 60 * 24 * 14,
    },
    metrics: {
        authRequired: true,
    },
    // Exact IP addresses of proxies/load balancers this server sits behind and trusts to set
    // X-Forwarded-For/X-Real-IP truthfully. Left empty by default (fail closed: forwarding headers are
    // ignored and NetUtils.getIPAddress() falls back to the socket's own remote address), which is safe
    // but means per-IP rate limiting and audit-log IPs will all collapse onto the proxy's own address in
    // any deployment that actually sits behind one (the common case in production). Set this to your
    // reverse proxy/load balancer's IP(s) if you deploy behind one.
    trusted_proxies: [],
    // The durable, queryable audit log (`BaseDatabaseAuditLogUtils`/`GET /api/audit-log`) keeps every entry
    // forever by default — `retention_days` is strictly opt-in: leave it unset/`null` and nothing is ever purged.
    // Set it to a positive number of days to let `AuditLogRetentionJob` (a small daily background job) delete
    // entries older than that window. Unexpected data loss in an audit trail would be a serious regression, so
    // there's no other way to enable purging.
    audit_log: {
        retention_days: null,
    },
    // The e-mail/SMS sent for every one-time code this server issues (sign-in, verifying a contact, registering).
    // Edited in the admin console (Messages) with no redeploy; see `DEFAULT_MESSAGE_TEMPLATES` for the defaults.
    // A copy, because nconf hands nested objects out by reference: without it, `config.set("templates:…")` (or
    // `MessagingUtils` loading a template's file) would rewrite `DEFAULT_MESSAGE_TEMPLATES` itself.
    //
    // HOW they're sent isn't set here on purpose — a placeholder host or sender would be seeded into the database as
    // if it were real. Set these for the FIRST start (in the environment, or your own config) and they seed the
    // database; from then on the admin console's Messages page owns them, and changing them here has no effect on
    // a running deployment until you restart and press "Reset to configuration" on that card:
    //   E-mail:  smtp_config__host, smtp_config__port, smtp_config__secure, smtp_config__auth__user,
    //            smtp_config__auth__pass, templates__from__email
    //   SMS:     sms_config__provider (twilio or telnyx — one at a time), then that provider's own settings:
    //            sms_config__config__accountSid + sms_config__config__token (Twilio), or
    //            sms_config__config__apiKey + sms_config__config__messagingProfileId (Telnyx); and templates__from__sms
    //   WhatsApp: whatsapp__accessToken, whatsapp__phoneNumberId, whatsapp__apiVersion
    // Secrets are encrypted at rest under `auth:oauth_server:keys:encryption_key`. Options the console doesn't model
    // (nodemailer's `smtp_config__tls__*`, Twilio's `sms_config__config__options__*`) stay here and are always merged in.
    templates: structuredClone(DEFAULT_MESSAGE_TEMPLATES),
});

export default conf;
