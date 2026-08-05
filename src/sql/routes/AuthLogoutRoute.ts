////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthLogoutRoute } from "@rapidrest/auth";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/logout")
export class AuthLogoutRoute extends BaseAuthLogoutRoute {}
