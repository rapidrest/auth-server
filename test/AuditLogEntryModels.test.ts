///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Unit tests for the two audit log entry models' constructors. Both re-apply each field from `other` after
// `super(other)` (the same pattern as SiteSettingsModels.test.ts), so what matters is that every field survives a
// copy, that an omitted field keeps its default rather than being clobbered to `undefined`, and that `data` keeps
// each backend's own storage shape (SQL: JSON text, Mongo: a real nested object).
import { describe, expect, it } from "vitest";
import { AuditLogEntryMongo } from "../src/models/mongo/AuditLogEntryMongo.js";
import { AuditLogEntrySQL } from "../src/models/sql/AuditLogEntrySQL.js";

describe.each([
    ["AuditLogEntrySQL", AuditLogEntrySQL, '{"secretUid":"s1"}'],
    ["AuditLogEntryMongo", AuditLogEntryMongo, { secretUid: "s1" }],
] as const)("%s", (_name, Model, data) => {
    const fields = {
        type: "auth.signed_in",
        userUid: "user-1",
        actorUid: "admin-1",
        ip: "127.0.0.1",
        path: "/api/auth/mfa",
        method: "password",
        data: data as any,
    };

    it("starts with an empty type and every optional field unset", () => {
        const entry = new Model();

        expect(entry.type).toBe("");
        expect(entry.userUid).toBeUndefined();
        expect(entry.actorUid).toBeUndefined();
        expect(entry.ip).toBeUndefined();
        expect(entry.path).toBeUndefined();
        expect(entry.method).toBeUndefined();
        expect(entry.data).toBeUndefined();
    });

    it("takes every field it's given, keeping each backend's own shape for `data`", () => {
        const entry = new Model(fields);

        expect(entry).toMatchObject(fields);
        expect(entry.data).toEqual(data);
    });

    it("keeps the default type, and leaves unset fields unset, when only some fields are given", () => {
        const entry = new Model({ userUid: "user-1" });

        expect(entry.type).toBe("");
        expect(entry.userUid).toBe("user-1");
        expect(entry.actorUid).toBeUndefined();
    });

    it("leaves userUid unset when only the type is given", () => {
        const entry = new Model({ type: "auth.elevated" });

        expect(entry.type).toBe("auth.elevated");
        expect(entry.userUid).toBeUndefined();
    });

    it("carries every field through the copy an update is built from", () => {
        const existing = new Model({ uid: "entry-1", ...fields });

        expect(new Model({ ...existing, ip: "10.0.0.1" })).toMatchObject({
            uid: "entry-1",
            ...fields,
            ip: "10.0.0.1",
        });
    });

    it("keeps a null, which is how a cleared column comes back, rather than treating it as unset", () => {
        const entry = new Model({ userUid: null as any, data: null as any });

        expect(entry.userUid).toBeNull();
        expect(entry.data).toBeNull();
    });
});
