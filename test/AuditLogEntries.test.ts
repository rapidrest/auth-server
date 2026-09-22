///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit tests for the pure shaping helpers shared by BaseDatabaseAuditLogUtils and BaseAuditLogRoute: normalizing
// `data` back to a real object regardless of which on-disk shape it was stored as (SQL's JSON text vs Mongo's
// native nested object), and mapping a stored entry to the API's response DTO.
import { describe, expect, it } from "vitest";
import { normalizeAuditData, toAuditLogEntryDTO } from "../src/audit/AuditLogEntries.js";
import type { AuditLogEntryEntity } from "../src/audit/BaseDatabaseAuditLogUtils.js";

describe("normalizeAuditData", () => {
    it("returns undefined for null/undefined", () => {
        expect(normalizeAuditData(undefined)).toBeUndefined();
        expect(normalizeAuditData(null)).toBeUndefined();
    });

    it("parses valid JSON text (the SQL storage shape) back into an object", () => {
        expect(normalizeAuditData('{"secretUid":"abc","scopes":["a","b"]}')).toEqual({ secretUid: "abc", scopes: ["a", "b"] });
    });

    it("returns undefined for blank text", () => {
        expect(normalizeAuditData("")).toBeUndefined();
        expect(normalizeAuditData("   ")).toBeUndefined();
    });

    it("returns undefined for text that isn't valid JSON", () => {
        expect(normalizeAuditData("not json")).toBeUndefined();
    });

    it("returns undefined for JSON text that parses to a non-object (array, number, string)", () => {
        expect(normalizeAuditData("[1,2,3]")).toBeUndefined();
        expect(normalizeAuditData("42")).toBeUndefined();
        expect(normalizeAuditData('"plain string"')).toBeUndefined();
    });

    it("passes a real object through as-is (the Mongo storage shape)", () => {
        const data = { secretUid: "abc", nested: { x: 1 } };
        expect(normalizeAuditData(data)).toEqual(data);
    });

    it("returns undefined for an array object", () => {
        expect(normalizeAuditData([1, 2, 3])).toBeUndefined();
    });
});

describe("toAuditLogEntryDTO", () => {
    function entity(overrides: Partial<AuditLogEntryEntity> = {}): AuditLogEntryEntity {
        return {
            uid: "entry-1",
            version: 0,
            dateCreated: new Date("2026-09-22T12:00:00.000Z"),
            dateModified: new Date("2026-09-22T12:00:00.000Z"),
            type: "auth.signed_in",
            ...overrides,
        };
    }

    it("maps every field, ISO-encoding the dates", () => {
        const dto = toAuditLogEntryDTO(
            entity({
                userUid: "user-1",
                actorUid: "admin-1",
                ip: "127.0.0.1",
                path: "/api/auth/mfa",
                method: "password",
                data: '{"secretUid":"s1"}',
            }),
        );

        expect(dto).toEqual({
            uid: "entry-1",
            version: 0,
            dateCreated: "2026-09-22T12:00:00.000Z",
            dateModified: "2026-09-22T12:00:00.000Z",
            type: "auth.signed_in",
            userUid: "user-1",
            actorUid: "admin-1",
            ip: "127.0.0.1",
            path: "/api/auth/mfa",
            method: "password",
            data: { secretUid: "s1" },
        });
    });

    it("leaves optional fields undefined when absent, including data", () => {
        const dto = toAuditLogEntryDTO(entity());

        expect(dto.userUid).toBeUndefined();
        expect(dto.actorUid).toBeUndefined();
        expect(dto.ip).toBeUndefined();
        expect(dto.path).toBeUndefined();
        expect(dto.method).toBeUndefined();
        expect(dto.data).toBeUndefined();
    });

    it("normalizes a null field to undefined (a SQL nullable column round-trip)", () => {
        const dto = toAuditLogEntryDTO(entity({ userUid: null as any, data: null }));

        expect(dto.userUid).toBeUndefined();
        expect(dto.data).toBeUndefined();
    });

    it("handles a stored date that's already a plain string (defensive, e.g. a raw document read)", () => {
        const dto = toAuditLogEntryDTO(entity({ dateCreated: "2026-01-01T00:00:00.000Z" as any }));
        expect(dto.dateCreated).toBe("2026-01-01T00:00:00.000Z");
    });
});
