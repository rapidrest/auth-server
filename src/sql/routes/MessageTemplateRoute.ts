////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseMessageTemplateRoute } from "../../routes/BaseMessageTemplateRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/messages`, alongside `/api/settings/branding` (see `SiteSettingsRoute`). See
 * `BaseMessageTemplateRoute` for the endpoints.
 */
@ApiRoute("/settings/messages")
export class MessageTemplateRoute extends BaseMessageTemplateRoute {}
