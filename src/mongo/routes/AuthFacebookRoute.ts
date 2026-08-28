////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { DocDecorators, HttpRequest, HttpResponse, RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteMongo } from "@rapidrest/auth/mongo";
import { OIDCProvider } from "@rapidrest/auth";
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
export class AuthFacebookRoute extends BaseAuthOIDCRouteMongo {
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

    // Points at this same route (not a frontend page) — `OIDCStrategy.authenticate()` handles both
    // legs of the dance on whichever route it's configured against: the initial GET (no `code`)
    // redirects the browser to Facebook, and Facebook's own redirect back here (now carrying `code`)
    // is what completes the exchange. See `login()` below for what happens once that succeeds.
    @Config("auth:facebook:redirectURI", "http://localhost:3000/api/auth/facebook")
    protected redirectURI: string | string[] = "http://localhost:3000/api/auth/facebook";

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
            "browser to Facebook's authorization dialog; Facebook's own redirect back to this same endpoint " +
            "(now carrying `code`) completes the exchange, sets the auth cookies, and redirects the browser to /account.",
    )
    @Returns([undefined])
    @Auth(["facebook"])
    @Get()
    @Post()
    public override async login(
        @AuthUser user: JWTUser,
        @Request req: HttpRequest,
        @Response res: HttpResponse,
    ): Promise<undefined> {
        // `login()` is only ever invoked once `@Auth(["facebook"])` has already run
        // OIDCStrategy.authenticate() to completion — the "redirect to Facebook" leg returns undefined
        // from authenticate() itself and never reaches this handler. So every call here really did just
        // complete a successful sign-in, and a real page navigation (not a raw JSON body) is what the
        // browser sitting on this URL after bouncing back from Facebook actually needs.
        await super.login(user, req, res);
        res.status(302);
        res.setHeader("Location", "/account");
        res.setHeader("Content-Length", 0);
        res.end();
        return undefined;
    }
}
