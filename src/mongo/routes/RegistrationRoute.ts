////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseRegistrationRouteMongo } from "@rapidrest/auth/mongo";
import { RouteDecorators } from "@rapidrest/service-core";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/register")
export class RegistrationRoute extends BaseRegistrationRouteMongo {}
