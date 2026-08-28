////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthDiscoverRouteSQL } from "@rapidrest/auth/sql";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/discover")
export class AuthDiscoverRoute extends BaseAuthDiscoverRouteSQL {}
