////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { BaseRegistrationRouteMongo } from "@rapidrest/auth/mongo";
import { RouteDecorators } from "@rapidrest/service-core";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/register")
export class RegistrationRoute extends BaseRegistrationRouteMongo {}
