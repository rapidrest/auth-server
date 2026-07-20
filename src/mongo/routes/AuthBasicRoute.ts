////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthBasicRouteMongo } from "@rapidrest/auth/mongo";
const { Route } = RouteDecorators;

@Route("/mongo/auth/password")
export class AuthBasicRoute extends BaseAuthBasicRouteMongo {}
