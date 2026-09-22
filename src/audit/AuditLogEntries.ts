///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { type AuditLogEntryEntity } from "./BaseDatabaseAuditLogUtils.js";

/**
 * The shape `GET /api/audit-log` and `GET /api/audit-log/:id` return — a raw pass-through of the stored entry
 * (there's no secret data on an audit entry, unlike `Secret`), except `data`, which is always normalized back to a
 * real object regardless of which datastore stored it as (`AuditLogEntrySQL`'s JSON text vs `AuditLogEntryMongo`'s
 * native nested field) — see `normalizeAuditData()`.
 */
export interface AuditLogEntryDTO {
    uid: string;
    version: number;
    /** ISO-8601. The event's own timestamp — there's no separate field for it. */
    dateCreated: string;
    dateModified: string;
    type: string;
    userUid?: string;
    actorUid?: string;
    ip?: string;
    path?: string;
    method?: string;
    data?: Record<string, unknown>;
}

/**
 * Normalizes `AuditLogEntrySQL`/`AuditLogEntryMongo`'s `data` back into a real object for the API response,
 * whichever of the two on-disk shapes it's stored as: `AuditLogEntrySQL` JSON-serializes it to `text` (parsed back
 * here), `AuditLogEntryMongo` keeps it as a real nested document (returned as-is here). A value that's absent,
 * blank, or fails to parse/isn't a plain object comes back `undefined` rather than throwing — a read of an entry
 * must never fail over its least important field.
 */
export function normalizeAuditData(value: unknown): Record<string, unknown> | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        if (value.trim() === "") {
            return undefined;
        }
        try {
            const parsed: unknown = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
        } catch {
            return undefined;
        }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function toISO(value: unknown): string {
    return value instanceof Date ? value.toISOString() : new Date(value as string | number).toISOString();
}

/** Maps a stored `AuditLogEntrySQL`/`AuditLogEntryMongo` row to the DTO the admin route returns. */
export function toAuditLogEntryDTO(entity: AuditLogEntryEntity): AuditLogEntryDTO {
    return {
        uid: entity.uid,
        version: entity.version,
        dateCreated: toISO(entity.dateCreated),
        dateModified: toISO(entity.dateModified),
        type: entity.type,
        userUid: entity.userUid ?? undefined,
        actorUid: entity.actorUid ?? undefined,
        ip: entity.ip ?? undefined,
        path: entity.path ?? undefined,
        method: entity.method ?? undefined,
        data: normalizeAuditData(entity.data),
    };
}
