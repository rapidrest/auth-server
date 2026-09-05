////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthDiscoveryRoute, OAuthDiscoveryEndpoints } from "@rapidrest/auth";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"])
export class OAuthDiscoveryRoute extends BaseOAuthDiscoveryRoute {
    protected get endpoints(): OAuthDiscoveryEndpoints {
        const issuer = this.issuer ?? "";
        return {
            authorization: `${issuer}/oauth/authorize`,
            token: `${issuer}/oauth/token`,
            jwks: `${issuer}/.well-known/jwks.json`,
            userinfo: `${issuer}/oauth/userinfo`,
            revocation: `${issuer}/oauth/revoke`,
            introspection: `${issuer}/oauth/introspect`,
        };
    }
}
