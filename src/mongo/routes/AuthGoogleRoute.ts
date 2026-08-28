////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteMongo } from "@rapidrest/auth/mongo";
import { OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { DEFAULT_GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_SECRET } from "../../config.defaults.js";

const { Config } = ObjectDecorators;
const { ApiRoute, Auth, Get, Post, Request, Response } = RouteDecorators;
const { Summary, Description, Returns } = DocDecorators;
const AuthUser = RouteDecorators.User;

@ApiRoute("/auth/google")
export class AuthGoogleRoute extends BaseAuthOIDCRouteMongo {
    // Registers this route's strategy as "google" rather than the base class's default "oauth" so it
    // can coexist with the other provider routes — see the doc comment on
    // `BaseAuthOIDCRoute.strategyName`/`login` for why both this and the `@Auth([...])` override below
    // are required together.
    protected strategyName = "google";

    @Config("auth:google:clientID", DEFAULT_GOOGLE_CLIENT_ID)
    protected clientID: string = DEFAULT_GOOGLE_CLIENT_ID;

    @Config("auth:google:clientSecret", DEFAULT_GOOGLE_CLIENT_SECRET)
    protected clientSecret: string = DEFAULT_GOOGLE_CLIENT_SECRET;

    // Points at this same route (not a frontend page) — `OIDCStrategy.authenticate()` handles both
    // legs of the dance on whichever route it's configured against: the initial GET (no `code`)
    // redirects the browser to Google, and Google's own redirect back here (now carrying `code`) is
    // what completes the exchange. See `login()` below for what happens once that succeeds.
    @Config("auth:google:redirectURI", "http://localhost:3000/api/auth/google")
    protected redirectURI: string | string[] = "http://localhost:3000/api/auth/google";

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
            "browser to Google's authorization page; Google's own redirect back to this same endpoint (now " +
            "carrying `code`) completes the exchange, sets the auth cookies, and redirects the browser to /account.",
    )
    @Returns([undefined])
    @Auth(["google"])
    @Get()
    @Post()
    public override async login(
        @AuthUser user: JWTUser,
        @Request req: HttpRequest,
        @Response res: HttpResponse,
    ): Promise<undefined> {
        // `login()` is only ever invoked once `@Auth(["google"])` has already run OIDCStrategy.authenticate()
        // to completion — the "redirect to Google" leg returns undefined from authenticate() itself and never
        // reaches this handler (see OIDCStrategy.authenticate()'s early-return branch). So every call here
        // really did just complete a successful sign-in, and a real page navigation (not a raw JSON body) is
        // what the browser sitting on this URL after bouncing back from Google actually needs.
        await super.login(user, req, res);
        res.status(302);
        res.setHeader("Location", "/account");
        res.setHeader("Content-Length", 0);
        res.end();
        return undefined;
    }
}
