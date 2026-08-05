///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { createRequire } from "module";
import nconf from "nconf";
import { join } from "path";

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
    cookie_secret: "f0fLSKFJLKWJFe09f32joff098u2fOFIWJ32890fnfnlak",
    cors: {
        origins: ["http://localhost:3000"],
    },
    datastores: {
        acl: {
            type: "postgres",
            host: "localhost",
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
        sql: {
            type: "postgres",
            host: "localhost",
            database: "rrst_auth",
            synchronize: true,
        },
    },
    class_loader: {
        ignore: [
            /server\..*/,
            /config\..*/
        ]
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
        secret: "MyPasswordIsSecure",
        options: {
            // "algorithm": "HS256",
            expiresIn: "7 days",
            audience: "mydomain.com",
            issuer: "api.mydomain.com",
        },
        oidc: {
            name: "test",
            authorizationURL: "https://oidc-test.com/authorize",
            clientID: "123457890",
            clientSecret: "f32fa983732aq9rf7ab39f",
            profileURL: "https://oidc-test.com/userinfo",
            protocol: "openid",
            redirectURI: "http://localhost:3000",
            tokenURL: "https://oidc-test.com/profile",
        },
        passkey: {
            rpName: "rapidrest",
            rpID: "rapidrest",
            origin: "http://localhost:3000",
        },
        fido2: {
            rpName: "rapidrest",
            rpID: "rapidrest",
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
    oauth_provider: {
        name: "oauth_test",
        /** STUB: Will be filled out by test. */
    },
    rbac: {
        enabled: true,
    },
    session: {
        secret: "SessionsHaveSecrets",
        cookieName: "rrst.sid",
        ttl: 300,
    },
    cluster_url: "http://localhost",
    metrics: {
        authRequired: false,
    },
});

export default conf;
