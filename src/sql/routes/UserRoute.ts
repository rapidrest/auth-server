////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { UserSQL, BaseUserRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Model, Route } = RouteDecorators;

@Model(UserSQL)
@Route("/sql/users")
export class UserRoute extends BaseUserRouteSQL {}
