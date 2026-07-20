////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseProfileRouteSQL, ProfileSQL } from "@rapidrest/auth/sql";
const { Model, Route } = RouteDecorators;

@Model(ProfileSQL)
@Route("/sql/profiles")
export class ProfileRoute extends BaseProfileRouteSQL {}
