////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteMongo } from "@rapidrest/auth/mongo";
import { AuthResult, OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import {
    DEFAULT_MICROSOFT_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_SECRET,
    DEFAULT_MICROSOFT_TENANT,
} from "../../config.defaults.js";

const { Config } = ObjectDecorators;
const { ApiRoute, Auth, Get, Post, Request, Response } = RouteDecorators;
const { Summary, Description, Returns } = DocDecorators;
const AuthUser = RouteDecorators.User;

@ApiRoute("/auth/microsoft")
export class AuthMicrosoftRoute extends BaseAuthOIDCRouteMongo {
    // Registers this route's strategy as "microsoft" rather than the base class's default "oauth" so it
    // can coexist with the other provider routes — see the doc comment on
    // `BaseAuthOIDCRoute.strategyName`/`login` for why both this and the `@Auth([...])` override below
    // are required together.
    protected strategyName = "microsoft";

    /**
     * The Entra ID (Azure AD) tenant to authenticate against. Defaults to the multi-tenant `common`
     * authority, which lets the authorization/token endpoints accept both work/school and personal
     * Microsoft accounts. IMPORTANT: Microsoft's id_token `iss` claim is tenant-specific even when the
     * request went through `common` (it reflects whichever tenant the user actually signed in with),
     * so leaving this at `common` means the strict single-issuer check in `OIDCStrategy.verifyIdToken`
     * will reject real sign-ins. Set this to your application's actual tenant ID/GUID (or `consumers`
     * for personal-accounts-only, whose id_tokens consistently use Microsoft's fixed consumers tenant
     * GUID as `iss`) before using this in production.
     */
    @Config("auth:microsoft:tenant", DEFAULT_MICROSOFT_TENANT)
    protected tenant: string = DEFAULT_MICROSOFT_TENANT;

    @Config("auth:microsoft:clientID", DEFAULT_MICROSOFT_CLIENT_ID)
    protected clientID: string = DEFAULT_MICROSOFT_CLIENT_ID;

    @Config("auth:microsoft:clientSecret", DEFAULT_MICROSOFT_CLIENT_SECRET)
    protected clientSecret: string = DEFAULT_MICROSOFT_CLIENT_SECRET;

    // Points at the frontend sign-in page (NOT this API route) — the page forwards the returned
    // `code`/`state` back to this same endpoint itself via a fetch call (see SignInFlow's mount
    // effect / completeOAuthSignIn in apps/shared/lib/api.ts) rather than the provider redirecting
    // here directly. This keeps error handling (denied consent, CSRF/state mismatch, exchange
    // failures) inside React's normal try/catch flow instead of a raw JSON response the browser
    // would otherwise land on after a top-level navigation.
    @Config("auth:microsoft:redirectURI", "http://localhost:3000/auth/signin")
    protected redirectURI: string | string[] = "http://localhost:3000/auth/signin";

    protected get providerConfig(): OIDCProvider {
        return {
            name: "microsoft",
            authorizationURL: `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize`,
            tokenURL: `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`,
            jwksURI: `https://login.microsoftonline.com/${this.tenant}/discovery/v2.0/keys`,
            issuer: `https://login.microsoftonline.com/${this.tenant}/v2.0`,
            protocol: "openid",
            pkce: "S256",
            clientID: this.clientID,
            clientSecret: this.clientSecret,
            redirectURI: this.redirectURI,
            scope: ["openid", "email", "profile"],
            // Maps Microsoft's id_token claim names onto the canonical `OIDCProfile` shape. Microsoft
            // only includes an `email` claim when the account has one associated and the `email` scope
            // was granted; `preferred_username` is the reliable fallback (usually a UPN or email alias).
            profileMap: {
                id: "profile.sub",
                email: "profile.email ?? profile.preferred_username",
                email_verified: "!!(profile.email ?? profile.preferred_username)",
                givenName: "profile.given_name",
                familyName: "profile.family_name",
                username: "profile.preferred_username",
            },
        };
    }

    @Summary("Login Microsoft")
    @Description(
        "Authenticates the user using Microsoft Entra ID (OpenID Connect). A request with no `code` redirects " +
            "the browser to Microsoft's authorization page; once the user approves, the frontend sign-in page " +
            "forwards the resulting `code`/`state` back to this same endpoint, which completes the exchange and " +
            "returns a JSON Web Token access token to be used with future API requests.",
    )
    @Returns([AuthResult, undefined])
    @Auth(["microsoft"])
    @Get()
    @Post()
    public override async login(
        @AuthUser user: JWTUser,
        @Request req: HttpRequest,
        @Response res: HttpResponse,
    ): Promise<AuthResult | undefined> {
        return super.login(user, req, res);
    }
}
