///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { HttpRequest, ObjectFactory, RouteDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";
import { fetchSiteSettingsPropsForSSR, PublicSiteSettings } from "../../routes/BaseSiteSettingsRoute.js";
import { SiteSettingsSQL } from "../../models/sql/SiteSettingsSQL.js";

const { Route } = RouteDecorators;
const { Inject } = ObjectDecorators;

@Route("/")
export class AppRoute extends ReactRoute {
    protected readonly appDir: string = "apps/www";
    protected readonly hydrate: boolean = true;

    @Inject(ObjectFactory)
    protected siteSettingsObjectFactory!: ObjectFactory;

    /**
     * Feeds this deployment's branding (`PublicSiteSettings`) into every page's props — and, since
     * `@rapidrest/react` now spreads the same props onto `_layout.tsx` too, into the page's `<head>`
     * (title/favicon/stylesheet) as well — so both render correctly on the very first byte of the
     * response, with no client-side flash from stock branding and no gap for a crawler to see only
     * the stock branding.
     */
    protected override async fetchProps(_req: HttpRequest): Promise<{ siteSettings: PublicSiteSettings }> {
        return fetchSiteSettingsPropsForSSR(this.siteSettingsObjectFactory, SiteSettingsSQL);
    }
}
