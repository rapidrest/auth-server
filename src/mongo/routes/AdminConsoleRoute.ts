///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import { ReactRoute } from "@rapidrest/react";
import { RouteDecorators } from "@rapidrest/service-core";

const { Route } = RouteDecorators;

@Route("/admin")
export class AdminConsoleRoute extends ReactRoute {
    protected readonly appDir: string = "apps/admin";
    protected readonly hydrate: boolean = true;
}
