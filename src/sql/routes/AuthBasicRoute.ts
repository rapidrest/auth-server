////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthBasicRouteSQL } from "@rapidrest/auth/sql";
const { Route } = RouteDecorators;

@Route("/sql/auth/password")
export class AuthBasicRoute extends BaseAuthBasicRouteSQL {}
