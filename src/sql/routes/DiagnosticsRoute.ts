///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseDiagnosticsRoute } from "../../routes/BaseDiagnosticsRoute.js";

const { ApiRoute } = RouteDecorators;

// Sits beside AdminRoute's `/api/admin` (release notes, restart, the `/logs` WebSocket) - the Diagnostics page uses both.
@ApiRoute("/admin/diagnostics")
export class DiagnosticsRoute extends BaseDiagnosticsRoute {}
