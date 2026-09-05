////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthUserInfoRouteMongo } from "@rapidrest/auth/mongo";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/oauth/userinfo")
export class OAuthUserInfoRoute extends BaseOAuthUserInfoRouteMongo {}
