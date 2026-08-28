////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseRegistrationRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/register")
export class RegistrationRoute extends BaseRegistrationRouteSQL {}
