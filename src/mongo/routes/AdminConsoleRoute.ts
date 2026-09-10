///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { HttpRequest, ObjectFactory, RouteDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";
import { fetchSiteSettingsPropsForSSR, PublicSiteSettings } from "../../routes/BaseSiteSettingsRoute.js";
import { SiteSettingsMongo } from "../../models/mongo/SiteSettingsMongo.js";

const { Route } = RouteDecorators;
const { Inject } = ObjectDecorators;

@Route("/admin")
export class AdminConsoleRoute extends ReactRoute {
    protected readonly appDir: string = "apps/admin";
    protected readonly hydrate: boolean = true;

    @Inject(ObjectFactory)
    protected siteSettingsObjectFactory!: ObjectFactory;

    /** See `WwwRoute.fetchProps()` (`src/mongo/routes/wwwRoute.ts`) — identical purpose, for the admin console. */
    protected override async fetchProps(_req: HttpRequest): Promise<{ siteSettings: PublicSiteSettings }> {
        return fetchSiteSettingsPropsForSSR(this.siteSettingsObjectFactory, SiteSettingsMongo);
    }
}
