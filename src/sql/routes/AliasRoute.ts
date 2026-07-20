////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { AliasSQL, BaseAliasRouteSQL } from "@rapidrest/auth/sql";
const { Model, Route } = RouteDecorators;

@Model(AliasSQL)
@Route("/sql/aliases")
export class AliasRoute extends BaseAliasRouteSQL {}
