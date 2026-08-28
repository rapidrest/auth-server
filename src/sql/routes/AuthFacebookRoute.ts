////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteSQL } from "@rapidrest/auth/sql";
import { AuthResult, OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { DEFAULT_FACEBOOK_CLIENT_ID, DEFAULT_FACEBOOK_CLIENT_SECRET } from "../../config.defaults.js";

const { Config } = ObjectDecorators;
const { ApiRoute, Auth, Get, Post, Request, Response } = RouteDecorators;
const { Summary, Description, Returns } = DocDecorators;
const AuthUser = RouteDecorators.User;

/** Facebook's Graph API/dialog endpoints require an explicit version prefix — bump this when it
 * approaches Meta's deprecation window for the pinned version. */
const GRAPH_API_VERSION = "v21.0";

@ApiRoute("/auth/facebook")
export class AuthFacebookRoute extends BaseAuthOIDCRouteSQL {
    // Registers this route's strategy as "facebook" rather than the base class's default "oauth" so
    // it can coexist with the other provider routes — see the doc comment on
    // `BaseAuthOIDCRoute.strategyName`/`login` for why both this and the `@Auth([...])` override below
    // are required together.
    protected strategyName = "facebook";

    // Facebook calls these "App ID"/"App Secret" in its developer console, but they're the same
    // OAuth client_id/client_secret as every other provider here.
    @Config("auth:facebook:clientID", DEFAULT_FACEBOOK_CLIENT_ID)
    protected clientID: string = DEFAULT_FACEBOOK_CLIENT_ID;

    @Config("auth:facebook:clientSecret", DEFAULT_FACEBOOK_CLIENT_SECRET)
    protected clientSecret: string = DEFAULT_FACEBOOK_CLIENT_SECRET;

    // Points at the frontend sign-in page (NOT this API route) — the page forwards the returned
    // `code`/`state` back to this same endpoint itself via a fetch call (see SignInFlow's mount
    // effect / completeOAuthSignIn in apps/shared/lib/api.ts) rather than the provider redirecting
    // here directly. This keeps error handling (denied consent, CSRF/state mismatch, exchange
    // failures) inside React's normal try/catch flow instead of a raw JSON response the browser
    // would otherwise land on after a top-level navigation.
    @Config("auth:facebook:redirectURI", "http://localhost:3000/auth/signin")
    protected redirectURI: string | string[] = "http://localhost:3000/auth/signin";

    protected get providerConfig(): OIDCProvider {
        return {
            name: "facebook",
            authorizationURL: `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`,
            tokenURL: `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`,
            // Facebook Login is plain OAuth 2.0, not OpenID Connect — it has no id_token/JWKS to
            // verify. `protocol: "oauth2"` makes OIDCStrategy skip straight to fetching `profileURL`
            // with the returned access token (Facebook accepts it via a standard `Authorization:
            // Bearer` header, matching what the strategy already sends).
            protocol: "oauth2",
            clientID: this.clientID,
            clientSecret: this.clientSecret,
            redirectURI: this.redirectURI,
            profileURL: `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,email,first_name,last_name,picture`,
            scope: ["email", "public_profile"],
            // Maps Facebook's Graph API `/me` field names onto the canonical `OIDCProfile` shape.
            // Facebook only returns `email` when the user granted that permission and only for an
            // account with a verified email address, so its mere presence implies verified.
            profileMap: {
                id: "profile.id",
                email: "profile.email",
                email_verified: "!!profile.email",
                givenName: "profile.first_name",
                familyName: "profile.last_name",
                avatar: "profile.picture?.data?.url",
                username: "profile.name",
            },
        };
    }

    @Summary("Login Facebook")
    @Description(
        "Authenticates the user using Facebook Login (OAuth 2.0). A request with no `code` redirects the " +
            "browser to Facebook's authorization dialog; once the user approves, the frontend sign-in page " +
            "forwards the resulting `code`/`state` back to this same endpoint, which completes the exchange and " +
            "returns a JSON Web Token access token to be used with future API requests.",
    )
    @Returns([AuthResult, undefined])
    @Auth(["facebook"])
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
