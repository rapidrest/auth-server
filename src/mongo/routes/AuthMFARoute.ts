////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthMFARouteMongo } from "@rapidrest/auth/mongo";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/mfa")
export class AuthMFARoute extends BaseAuthMFARouteMongo {
    /**
     * `MFAStrategyOptions.require2FA` defaults to `true` in the base class and isn't otherwise
     * configurable. That would refuse sign-in outright for every account with no registered secondary
     * method. Drive it instead from the `auth:requireMFA` global config flag (the same flag `BaseUserRoute`
     * used to force `User.requireMFA` before that moved to the runtime-togglable `SystemSettings.requireMFA`
     * — see its own doc comment), so a server-wide opt-in enforces "you must have 2FA to sign in at all"
     * while the default (`false`) only forces the challenge/verify phases for accounts that already have a
     * secondary method registered.
     *
     * Deliberately still reads the static config, not `SystemSettings`, here: unlike `BaseUserRoute`'s
     * checks (which run per-request, well after startup), this runs once during `initialize()`, at the
     * same time other startup jobs (e.g. `DefaultAccountsMongo`'s own seeding) are still writing to the
     * same datastore — an extra `SystemSettingsUtils` read/create at that exact moment was found to race a
     * concurrent transaction and corrupt other startup work (confirmed on SQL; not re-verified against
     * Mongo, but kept consistent with the SQL route rather than risk the same class of bug here too). An
     * admin toggling "Require MFA" via `PUT /api/settings` therefore needs a server restart to change
     * *this* enforcement point specifically, even though account creation/update already reacts immediately.
     */
    protected async initialize(): Promise<void> {
        await super.initialize();
        const strategy = this.authMiddleware?.strategies.get("mfa") as any;
        if (strategy) {
            strategy.options.require2FA = !!this.jwtConfig?.requireMFA;
        }
    }
}
