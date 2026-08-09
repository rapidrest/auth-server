////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthMFARouteSQL } from "@rapidrest/auth/sql";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/mfa")
export class AuthMFARoute extends BaseAuthMFARouteSQL {
    /**
     * `MFAStrategyOptions.require2FA` defaults to `true` in the base class and isn't otherwise
     * configurable. That would refuse sign-in outright for every account with no registered secondary
     * method. Drive it instead from the `auth:require_mfa` global config flag (the same flag
     * `BaseUserRoute` uses to force `User.requireMFA`), so a server-wide opt-in enforces "you must have
     * 2FA to sign in at all" while the default (`false`) only forces the challenge/verify phases for
     * accounts that already have a secondary method registered.
     */
    protected async initialize(): Promise<void> {
        await super.initialize();
        const strategy = this.authMiddleware?.strategies.get("mfa") as any;
        if (strategy) {
            strategy.options.require2FA = !!this.jwtConfig?.require_mfa;
        }
    }
}
