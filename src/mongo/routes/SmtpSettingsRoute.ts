////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseSmtpSettingsRoute } from "../../routes/BaseSmtpSettingsRoute.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/settings/smtp`. See `BaseSmtpSettingsRoute` for the endpoints.
 */
@ApiRoute("/settings/smtp")
export class SmtpSettingsRoute extends BaseSmtpSettingsRoute {}
