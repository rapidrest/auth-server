////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthRefreshRouteMongo } from "@rapidrest/auth/mongo";
const { ApiRoute } = RouteDecorators;

@ApiRoute("/auth/refresh")
export class AuthRefreshRoute extends BaseAuthRefreshRouteMongo {}
