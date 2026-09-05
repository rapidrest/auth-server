////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthAuthorizeRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/authorize")
export class OAuthAuthorizeRoute extends BaseOAuthAuthorizeRouteSQL {
    // "jwt" alone is enough: any successful sign-in this app supports (password, MFA, passkey, or a
    // federated Google/Microsoft/Apple/Facebook login via AuthGoogleRoute/etc.) already populates the
    // session `resolveUserUid()`'s fast path reads first, so federation needs no extra wiring here.
    protected resourceOwnerStrategies: string[] = ["jwt"];
}
