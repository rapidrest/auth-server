////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAliasRouteMongo } from "@rapidrest/auth/mongo";
const { Route } = RouteDecorators;

@Route("/mongo/aliases")
export class AliasRoute extends BaseAliasRouteMongo {}
