////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthDiscoverRouteMongo } from "@rapidrest/auth/mongo";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/discover")
export class AuthDiscoverRoute extends BaseAuthDiscoverRouteMongo {}
