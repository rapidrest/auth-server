///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { HttpRequest, ObjectFactory, RouteDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";
import { fetchSiteSettingsPropsForSSR, PublicSiteSettings } from "../../routes/BaseSiteSettingsRoute.js";
import { SiteSettingsSQL } from "../../models/sql/SiteSettingsSQL.js";
import { fetchSystemSettingsPropsForSSR, PublicSystemSettings } from "../../routes/SystemSettingsSSR.js";
import { toEnabledOAuthProviders } from "../../routes/OAuthProviders.js";
import { toTrustedOrigins } from "../../routes/TrustedOrigins.js";

const { Route } = RouteDecorators;
const { Config, Inject } = ObjectDecorators;

@Route("/")
export class AppRoute extends ReactRoute {
    protected readonly appDir: string = "apps/www";
    protected readonly hydrate: boolean = true;

    @Inject(ObjectFactory)
    protected siteSettingsObjectFactory!: ObjectFactory;

    /** The configured CORS origins — the downstream apps a sign-in may hand the user back to. See `toTrustedOrigins()`. */
    @Config("cors:origins", [])
    protected corsOrigins: unknown = [];

    /** The configured `clientID` of each built-in OAuth provider — see `toEnabledOAuthProviders()`. */
    @Config("auth:google:clientID", "")
    protected googleClientID: unknown = "";

    @Config("auth:microsoft:clientID", "")
    protected microsoftClientID: unknown = "";

    @Config("auth:apple:clientID", "")
    protected appleClientID: unknown = "";

    @Config("auth:facebook:clientID", "")
    protected facebookClientID: unknown = "";

    /**
     * Feeds this deployment's branding (`PublicSiteSettings`) into every page's props — and, since
     * `@rapidrest/react` now spreads the same props onto `_layout.tsx` too, into the page's `<head>`
     * (title/favicon/stylesheet) as well — so both render correctly on the very first byte of the
     * response, with no client-side flash from stock branding and no gap for a crawler to see only
     * the stock branding. Also feeds `systemSettings.allowRegistration`, so `apps/www/auth/{signup,signin}`
     * can render their closed-registration state (or hide the "Create one" link) on that same first byte.
     * Also feeds `returnToOrigins` (the configured `cors.origins`), which `apps/www/auth/signin.tsx` checks a
     * downstream app's `?return_to=` against before redirecting to another origin.
     * Also feeds `oauthProviders`, the built-in OAuth providers whose `clientID` has been replaced, so
     * `apps/www/auth/signin.tsx` only offers the "Continue with ..." buttons that can actually sign someone in.
     */
    protected override async fetchProps(
        _req: HttpRequest,
    ): Promise<{
        siteSettings: PublicSiteSettings;
        systemSettings: PublicSystemSettings;
        returnToOrigins: string[];
        oauthProviders: string[];
    }> {
        const [siteSettings, systemSettings] = await Promise.all([
            fetchSiteSettingsPropsForSSR(this.siteSettingsObjectFactory, SiteSettingsSQL),
            fetchSystemSettingsPropsForSSR(this.siteSettingsObjectFactory, "sql"),
        ]);
        return {
            ...siteSettings,
            ...systemSettings,
            returnToOrigins: toTrustedOrigins(this.corsOrigins),
            oauthProviders: toEnabledOAuthProviders({
                google: this.googleClientID,
                microsoft: this.microsoftClientID,
                apple: this.appleClientID,
                facebook: this.facebookClientID,
            }),
        };
    }
}
