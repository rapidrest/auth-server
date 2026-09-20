////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseTwilioSettingsRoute } from "../../routes/BaseTwilioSettingsRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/twilio`. See `BaseTwilioSettingsRoute` for the endpoints.
 */
@ApiRoute("/settings/twilio")
export class TwilioSettingsRoute extends BaseTwilioSettingsRoute {}
