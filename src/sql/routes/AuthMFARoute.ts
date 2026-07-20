////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthMFARouteSQL } from "@rapidrest/auth/sql";
const { Route } = RouteDecorators;

@Route("/sql/auth/mfa")
export class AuthMFARoute extends BaseAuthMFARouteSQL {}
