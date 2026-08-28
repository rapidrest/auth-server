////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteSQL } from "@rapidrest/auth/sql";
import { AuthResult, OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { DEFAULT_GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_SECRET } from "../../config.defaults.js";

const { Config } = ObjectDecorators;
const { ApiRoute, Auth, Get, Post, Request, Response } = RouteDecorators;
const { Summary, Description, Returns } = DocDecorators;
const AuthUser = RouteDecorators.User;

@ApiRoute("/auth/google")
export class AuthGoogleRoute extends BaseAuthOIDCRouteSQL {
    // Registers this route's strategy as "google" rather than the base class's default "oauth" so it
    // can coexist with the other provider routes — see the doc comment on
    // `BaseAuthOIDCRoute.strategyName`/`login` for why both this and the `@Auth([...])` override below
    // are required together.
    protected strategyName = "google";

    @Config("auth:google:clientID", DEFAULT_GOOGLE_CLIENT_ID)
    protected clientID: string = DEFAULT_GOOGLE_CLIENT_ID;

    @Config("auth:google:clientSecret", DEFAULT_GOOGLE_CLIENT_SECRET)
    protected clientSecret: string = DEFAULT_GOOGLE_CLIENT_SECRET;

    // Points at the frontend sign-in page (NOT this API route) — the page forwards the returned
    // `code`/`state` back to this same endpoint itself via a fetch call (see SignInFlow's mount
    // effect / completeOAuthSignIn in apps/shared/lib/api.ts) rather than the provider redirecting
    // here directly. This keeps error handling (denied consent, CSRF/state mismatch, exchange
    // failures) inside React's normal try/catch flow instead of a raw JSON response the browser
    // would otherwise land on after a top-level navigation.
    @Config("auth:google:redirectURI", "http://localhost:3000/auth/signin")
    protected redirectURI: string | string[] = "http://localhost:3000/auth/signin";

    protected get providerConfig(): OIDCProvider {
        return {
            name: "google",
            authorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenURL: "https://oauth2.googleapis.com/token",
            jwksURI: "https://www.googleapis.com/oauth2/v3/certs",
            issuer: "https://accounts.google.com",
            protocol: "openid",
            pkce: "S256",
            clientID: this.clientID,
            clientSecret: this.clientSecret,
            redirectURI: this.redirectURI,
            scope: ["openid", "email", "profile"],
            // Maps Google's id_token claim names onto the canonical `OIDCProfile` shape.
            profileMap: {
                id: "profile.sub",
                email: "profile.email",
                email_verified: "profile.email_verified",
                givenName: "profile.given_name",
                familyName: "profile.family_name",
                avatar: "profile.picture",
                username: "profile.email",
                locale: "profile.locale",
            },
        };
    }

    @Summary("Login Google")
    @Description(
        "Authenticates the user using Google Sign-In (OpenID Connect). A request with no `code` redirects the " +
            "browser to Google's authorization page; once the user approves, the frontend sign-in page forwards " +
            "the resulting `code`/`state` back to this same endpoint, which completes the exchange and returns " +
            "a JSON Web Token access token to be used with future API requests.",
    )
    @Returns([AuthResult, undefined])
    @Auth(["google"])
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
