////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { DatabaseDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDiagnosticsRoute } from "../../routes/BaseDiagnosticsRoute.js";
const { DataSource } = DatabaseDecorators;
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/diagnostics`. See `BaseDiagnosticsRoute` for the endpoints.
 */
@ApiRoute("/diagnostics")
export class DiagnosticsRoute extends BaseDiagnosticsRoute {
    @DataSource("sql", false)
    protected primaryDatastore?: any;

    protected primaryKind = "sql" as const;
}
