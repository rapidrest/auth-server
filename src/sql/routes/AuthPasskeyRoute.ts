////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthPasskeyRouteSQL } from "@rapidrest/auth/sql";
const { Route } = RouteDecorators;

@Route("/sql/auth/passkey")
export class AuthPasskeyRoute extends BaseAuthPasskeyRouteSQL {}
