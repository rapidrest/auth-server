///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { RouteDecorators } from "@rapidrest/service-core";

const { Route } = RouteDecorators;

@Route("/")
export class AppRoute extends ReactRoute {
    protected readonly appDir: string = "apps/www";
    protected readonly hydrate: boolean = true;
}
