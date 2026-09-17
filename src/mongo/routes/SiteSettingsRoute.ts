////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { SiteSettingsMongo } from "../../models/mongo/SiteSettingsMongo.js";
import { BaseSiteSettingsRoute } from "../../routes/BaseSiteSettingsRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/branding` — deliberately not `/api/settings` (see `SettingsRoute`, which owns
 * that path for the deployment's registration/MFA policy). See `BaseSiteSettingsRoute` for the full set of
 * endpoints (`GET /`, `PUT /`, `POST|DELETE|GET /logo`, `POST|DELETE|GET /stylesheet`).
 */
@ApiRoute("/settings/branding")
export class SiteSettingsRoute extends BaseSiteSettingsRoute<SiteSettingsMongo> {
    protected settingsClass = SiteSettingsMongo;
}
