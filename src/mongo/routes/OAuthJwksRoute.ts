////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthJwksRouteMongo } from "@rapidrest/auth/mongo";
import { RouteDecorators } from "@rapidrest/service-core";
const { Route } = RouteDecorators;

@Route("/.well-known/jwks.json")
export class OAuthJwksRoute extends BaseOAuthJwksRouteMongo {}
