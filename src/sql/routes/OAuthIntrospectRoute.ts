////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthIntrospectRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/introspect")
export class OAuthIntrospectRoute extends BaseOAuthIntrospectRouteSQL {}
