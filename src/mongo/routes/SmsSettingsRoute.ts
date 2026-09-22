////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseSmsSettingsRoute } from "../../routes/BaseSmsSettingsRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/sms`. See `BaseSmsSettingsRoute` for the endpoints.
 */
@ApiRoute("/settings/sms")
export class SmsSettingsRoute extends BaseSmsSettingsRoute {}
