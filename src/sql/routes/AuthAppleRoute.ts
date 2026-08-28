////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteSQL } from "@rapidrest/auth/sql";
import { OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import * as jwt from "jsonwebtoken";
import {
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_APPLE_KEY_ID,
    DEFAULT_APPLE_PRIVATE_KEY,
    DEFAULT_APPLE_TEAM_ID,
} from "../../config.defaults.js";

const { Config } = ObjectDecorators;
const { ApiRoute, Auth, Get, Post, Request, Response } = RouteDecorators;
const { Summary, Description, Returns } = DocDecorators;
const AuthUser = RouteDecorators.User;

/** The maximum lifetime Apple allows for a `client_secret` JWT is 6 months (15777000s). Regenerating
 * a little under that keeps a long-running process from ever presenting an expired secret. */
const CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 150;
/** Regenerate once less than an hour of validity remains, rather than waiting for outright expiry. */
const CLIENT_SECRET_RENEWAL_WINDOW_SECONDS = 60 * 60;

@ApiRoute("/auth/apple")
export class AuthAppleRoute extends BaseAuthOIDCRouteSQL {
    // Registers this route's strategy as "apple" rather than the base class's default "oauth" so it
    // can coexist with the other provider routes — see the doc comment on
    // `BaseAuthOIDCRoute.strategyName`/`login` for why both this and the `@Auth([...])` override below
    // are required together.
    protected strategyName = "apple";

    /** The Services ID registered with Apple — used as both the OAuth `client_id` and the `sub` claim
     * of the generated `client_secret` JWT. */
    @Config("auth:apple:clientID", DEFAULT_APPLE_CLIENT_ID)
    protected clientID: string = DEFAULT_APPLE_CLIENT_ID;

    /** The Apple Developer Team ID, used as the `iss` claim of the generated `client_secret` JWT. */
    @Config("auth:apple:teamId", DEFAULT_APPLE_TEAM_ID)
    protected teamId: string = DEFAULT_APPLE_TEAM_ID;

    /** The Key ID of the private key registered with Apple, sent as the JWT's `kid` header. */
    @Config("auth:apple:keyId", DEFAULT_APPLE_KEY_ID)
    protected keyId: string = DEFAULT_APPLE_KEY_ID;

    /** The PEM-encoded ES256 private key downloaded from Apple Developer, used to sign the `client_secret` JWT. */
    @Config("auth:apple:privateKey", DEFAULT_APPLE_PRIVATE_KEY)
    protected privateKey: string = DEFAULT_APPLE_PRIVATE_KEY;

    // Points at this same route (not a frontend page) — `OIDCStrategy.authenticate()` handles both
    // legs of the dance on whichever route it's configured against: the initial GET (no `code`)
    // redirects the browser to Apple, and Apple's own redirect back here (now carrying `code`) is
    // what completes the exchange. See `login()` below for what happens once that succeeds. Note
    // Apple requires a registered "Return URL" to be HTTPS (no `localhost` exception like Google) —
    // this default only works for provider configuration/testing purposes, not a real callback.
    @Config("auth:apple:redirectURI", "http://localhost:3000/api/auth/apple")
    protected redirectURI: string | string[] = "http://localhost:3000/api/auth/apple";

    private cachedClientSecret?: { value: string; expiresAt: number };

    /**
     * Unlike every other OIDC provider, Apple does not accept a static shared `client_secret` — it
     * requires a JWT signed with the developer's ES256 private key, asserting the app's identity, that
     * Apple itself verifies on each token exchange. `OIDCProvider.clientSecret` has no notion of this,
     * so it's synthesized here on demand (and cached until shortly before it expires) rather than
     * plumbing token generation into the shared `OIDCStrategy`.
     */
    private getClientSecret(): string {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (!this.cachedClientSecret || this.cachedClientSecret.expiresAt - nowSeconds < CLIENT_SECRET_RENEWAL_WINDOW_SECONDS) {
            const expiresAt = nowSeconds + CLIENT_SECRET_TTL_SECONDS;
            const value = jwt.sign(
                {
                    iss: this.teamId,
                    iat: nowSeconds,
                    exp: expiresAt,
                    aud: "https://appleid.apple.com",
                    sub: this.clientID,
                },
                this.privateKey,
                { algorithm: "ES256", keyid: this.keyId },
            );
            this.cachedClientSecret = { value, expiresAt };
        }
        return this.cachedClientSecret.value;
    }

    protected get providerConfig(): OIDCProvider {
        return {
            name: "apple",
            authorizationURL: "https://appleid.apple.com/auth/authorize",
            tokenURL: "https://appleid.apple.com/auth/token",
            jwksURI: "https://appleid.apple.com/auth/keys",
            issuer: "https://appleid.apple.com",
            protocol: "openid",
            pkce: "S256",
            clientID: this.clientID,
            clientSecret: this.getClientSecret(),
            redirectURI: this.redirectURI,
            // Apple only sends `name` in the initial authorization response's `user` form field (never
            // in the id_token, and never again on subsequent logins) — capturing it would require
            // reading that extra field, which the generic OIDCStrategy doesn't do. `email`/`sub` are
            // always available from the id_token, so given/family name are simply left unset here.
            scope: ["openid", "email"],
            // Maps Apple's id_token claim names onto the canonical `OIDCProfile` shape. Apple encodes
            // `email_verified` (and `is_private_email`) as the string "true"/"false" rather than a
            // JSON boolean.
            profileMap: {
                id: "profile.sub",
                email: "profile.email",
                email_verified: "profile.email_verified === true || profile.email_verified === 'true'",
            },
        };
    }

    @Summary("Login Apple")
    @Description(
        "Authenticates the user using Sign in with Apple (OpenID Connect). A request with no `code` redirects " +
            "the browser to Apple's authorization page; Apple's own redirect back to this same endpoint (now " +
            "carrying `code`) completes the exchange, sets the auth cookies, and redirects the browser to /account.",
    )
    @Returns([undefined])
    @Auth(["apple"])
    @Get()
    @Post()
    public override async login(
        @AuthUser user: JWTUser,
        @Request req: HttpRequest,
        @Response res: HttpResponse,
    ): Promise<undefined> {
        // `login()` is only ever invoked once `@Auth(["apple"])` has already run OIDCStrategy.authenticate()
        // to completion — the "redirect to Apple" leg returns undefined from authenticate() itself and never
        // reaches this handler. So every call here really did just complete a successful sign-in, and a real
        // page navigation (not a raw JSON body) is what the browser sitting on this URL after bouncing back
        // from Apple actually needs.
        await super.login(user, req, res);
        res.status(302);
        res.setHeader("Location", "/account");
        res.setHeader("Content-Length", 0);
        res.end();
        return undefined;
    }
}
