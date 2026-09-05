////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthRevokeRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/revoke")
export class OAuthRevokeRoute extends BaseOAuthRevokeRouteSQL {}
