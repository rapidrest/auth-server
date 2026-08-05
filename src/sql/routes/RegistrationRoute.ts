////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { BaseRegistrationRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/register")
export class RegistrationRoute extends BaseRegistrationRouteSQL {}
