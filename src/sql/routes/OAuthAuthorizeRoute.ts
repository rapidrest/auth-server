////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthAuthorizeRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/authorize")
export class OAuthAuthorizeRoute extends BaseOAuthAuthorizeRouteSQL {
    // "jwt" alone is enough: every completed sign-in this app supports (password, MFA, passkey, or a
    // federated Google/Microsoft/Apple/Facebook login via AuthGoogleRoute/etc.) goes through
    // `TokenUtils.createAuthResult()`, which records `session.signedInUid`/`signedInAt`. Since
    // @rapidrest/auth 3, `resolveUserUid()` requires those (a bare access token, a password-only MFA
    // step or an impersonation session is refused), and refuses a sign-in older than the user's
    // "sign out everywhere", so federation needs no extra wiring here.
    protected resourceOwnerStrategies: string[] = ["jwt"];
}
