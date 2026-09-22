///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { HttpRequest, ObjectFactory, RouteDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";
import { fetchSiteSettingsPropsForSSR, PublicSiteSettings } from "../../routes/BaseSiteSettingsRoute.js";
import { SiteSettingsMongo } from "../../models/mongo/SiteSettingsMongo.js";
import { fetchSystemSettingsPropsForSSR, PublicSystemSettings } from "../../routes/SystemSettingsSSR.js";

const { Route } = RouteDecorators;
const { Config, Inject } = ObjectDecorators;

@Route("/admin")
export class AdminConsoleRoute extends ReactRoute {
    protected readonly appDir: string = "apps/admin";
    protected readonly hydrate: boolean = true;

    @Inject(ObjectFactory)
    protected siteSettingsObjectFactory!: ObjectFactory;

    /** The deployment's `site_settings` config, which seeds the branding row if this page is the first to read it. */
    @Config("site_settings", null)
    protected siteSettingsConfig: unknown = null;

    /**
     * See `WwwRoute.fetchProps()` (`src/mongo/routes/wwwRoute.ts`) — identical purpose, for the admin console.
     * Also feeds `systemSettings` (currently just `allowRegistration`) into the same page props, e.g. for
     * `apps/admin/settings.tsx` to render its initial state without a client-side round trip.
     */
    protected override async fetchProps(
        _req: HttpRequest,
    ): Promise<{ siteSettings: PublicSiteSettings; systemSettings: PublicSystemSettings }> {
        const [siteSettings, systemSettings] = await Promise.all([
            fetchSiteSettingsPropsForSSR(this.siteSettingsObjectFactory, SiteSettingsMongo, this.siteSettingsConfig),
            fetchSystemSettingsPropsForSSR(this.siteSettingsObjectFactory, "mongo"),
        ]);
        return { ...siteSettings, ...systemSettings };
    }
}
