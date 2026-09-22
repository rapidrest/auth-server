////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseAuditLogRoute } from "../../routes/BaseAuditLogRoute.js";
import { AuditLogEntrySQL } from "../../models/sql/AuditLogEntrySQL.js";
const { ApiRoute } = RouteDecorators;

/**
 * Mounted at `/api/audit-log`. See `BaseAuditLogRoute` for the endpoints.
 */
@ApiRoute("/audit-log")
export class AuditLogRoute extends BaseAuditLogRoute {
    protected entryClass = AuditLogEntrySQL;
}
