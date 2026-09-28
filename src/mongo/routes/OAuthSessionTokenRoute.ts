////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthSessionTokenRouteMongo } from "@rapidrest/auth/mongo";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/session-token")
export class OAuthSessionTokenRoute extends BaseOAuthSessionTokenRouteMongo {}
