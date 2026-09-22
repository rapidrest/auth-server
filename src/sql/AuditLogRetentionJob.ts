///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseAuditLogRetentionJob } from "../audit/BaseAuditLogRetentionJob.js";
import { AuditLogEntrySQL } from "../models/sql/AuditLogEntrySQL.js";

/**
 * Purges sql audit log entries older than `audit_log:retention_days`, when that's configured. See
 * `BaseAuditLogRetentionJob` — unconfigured (the default) means this never deletes anything.
 */
export class AuditLogRetentionJob extends BaseAuditLogRetentionJob {
    protected entryClass = AuditLogEntrySQL;
}
