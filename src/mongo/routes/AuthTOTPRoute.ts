////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuthTOTPRouteMongo } from "@rapidrest/auth/mongo";
const { Route } = RouteDecorators;

@Route("/mongo/auth/totp")
export class AuthTOTPRoute extends BaseAuthTOTPRouteMongo {}
