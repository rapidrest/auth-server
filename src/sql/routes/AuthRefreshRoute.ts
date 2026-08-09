////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthRefreshRouteSQL } from "@rapidrest/auth/sql";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/refresh")
export class AuthRefreshRoute extends BaseAuthRefreshRouteSQL {}
