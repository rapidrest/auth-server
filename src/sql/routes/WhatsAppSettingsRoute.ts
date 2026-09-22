////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseWhatsAppSettingsRoute } from "../../routes/BaseWhatsAppSettingsRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/whatsapp`. See `BaseWhatsAppSettingsRoute` for the endpoints.
 */
@ApiRoute("/settings/whatsapp")
export class WhatsAppSettingsRoute extends BaseWhatsAppSettingsRoute {}
