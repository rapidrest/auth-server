///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseDatabaseAuditLogUtils } from "../audit/BaseDatabaseAuditLogUtils.js";
import { AuditLogEntryMongo } from "../models/mongo/AuditLogEntryMongo.js";

/**
 * The `AuditLogUtils` this server runs, storing audit entries in mongo. See `BaseDatabaseAuditLogUtils`.
 *
 * **The file's name is what makes it work.** `Server` registers every class it finds under this directory in
 * `ObjectFactory` by name, before anything is instantiated, and a default export takes its file's name — so this
 * one is registered as `AuditLogUtils`, which is the name every `@Inject(AuditLogUtils)` in `@rapidrest/auth`
 * resolves to. Renaming or moving it silently puts the stock (log-only) `AuditLogUtils` back.
 */
export default class DatabaseAuditLogUtilsMongo extends BaseDatabaseAuditLogUtils {
    protected entryClass = AuditLogEntryMongo;

    /** `AuditLogEntryMongo.data` is a real nested field, not JSON text — store `entry.data` as-is. */
    protected override encodeData(data?: Record<string, unknown>): unknown {
        return data;
    }
}
