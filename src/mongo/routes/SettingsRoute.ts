////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseSettingsRouteMongo } from "@rapidrest/auth/mongo";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/settings")
export class SettingsRoute extends BaseSettingsRouteMongo {}
