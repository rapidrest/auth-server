////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthOIDCRouteMongo } from "@rapidrest/auth/mongo";
import { OIDCProvider } from "@rapidrest/auth";
import { ObjectDecorators } from "@rapidrest/core";
import { DEFAULT_OIDC_CLIENT_ID, DEFAULT_OIDC_CLIENT_SECRET } from "../../config.defaults.js";
const { Config } = ObjectDecorators;
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/oidc")
export class AuthOIDCRoute extends BaseAuthOIDCRouteMongo {
    @Config("auth:oidc")
    protected providerConfig: OIDCProvider = {
        name: "test",
        authorizationURL: "https://oidc-test.com/authorize",
        clientID: DEFAULT_OIDC_CLIENT_ID,
        clientSecret: DEFAULT_OIDC_CLIENT_SECRET,
        profileURL: "https://oidc-test.com/userinfo",
        protocol: "openid",
        redirectURI: "http://localhost:3000",
        tokenURL: "https://oidc-test.com/profile",
    };
}
