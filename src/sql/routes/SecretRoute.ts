////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { BaseSecretRouteSQL, SecretSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { Model, Route } = RouteDecorators;

@Model(SecretSQL)
@Route("/sql/secrets")
export class SecretRoute extends BaseSecretRouteSQL {}
