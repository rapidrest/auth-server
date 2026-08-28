///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { createRequire } from "module";
import nconf from "nconf";
import { join } from "path";
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
    DEFAULT_SESSION_SECRET,
} from "./config.defaults.js";

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
    // Settings pertaining to the signing and verification of authentication tokens
    auth: {
        // The default authentication strategy to use
        strategy: "auth.JWTStrategy",
        allowQueryParam: true,
        // The default set of scopes to grant newly authenticated users
        default_scopes: ["profile:contacts", "profile:preferences"],
        // The password to be used when signing or verifying authentication tokens
        secret: DEFAULT_AUTH_SECRET,
        // Set to `true` to force multi-factor authentication for every account regardless of its own
        // `requireMFA` value (see `BaseUserRoute.validateCreate`/`validateUpdate` and `AuthMFARoute`,
        // which drives `MFAStrategyOptions.require2FA` from this same flag).
        require_mfa: false,
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
    cluster_url: "http://localhost",
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
});

export default conf;
