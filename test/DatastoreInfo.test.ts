///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it, vi } from "vitest";
import { probeMongo, probeRedis, probeSql } from "../src/diagnostics/DatastoreInfo.js";

describe("probeMongo", () => {
    it("reports the version and the volume's use", async () => {
        const connection = {
            admin: () => ({ serverInfo: async () => ({ version: "8.0.4" }) }),
            db: { command: vi.fn(async () => ({ fsUsedSize: 100, fsTotalSize: 1000, storageSize: 5 })) },
        };
        expect(await probeMongo(connection)).toEqual({
            kind: "mongodb",
            role: "database",
            version: "8.0.4",
            usedBytes: 100,
            totalBytes: 1000,
        });
        expect(connection.db.command).toHaveBeenCalledWith({ dbStats: 1 });
    });

    it("falls back to the storage size when the server doesn't report the filesystem", async () => {
        const connection = {
            admin: () => ({ serverInfo: async () => ({ version: "7.0.0" }) }),
            db: { command: async () => ({ storageSize: 5 }) },
        };
        expect(await probeMongo(connection)).toMatchObject({ usedBytes: 5, totalBytes: undefined });
    });

    it("reports a failure as an error", async () => {
        const connection = {
            admin: () => ({ serverInfo: async () => Promise.reject(new Error("not connected")) }),
            db: { command: async () => ({}) },
        };
        expect(await probeMongo(connection)).toEqual({ kind: "mongodb", role: "database", error: "not connected" });
    });
});

describe("probeSql", () => {
    it("reports PostgreSQL's version and database size", async () => {
        const ds = {
            options: { type: "postgres" },
            query: async () => [{ version: "PostgreSQL 16.4 on x86_64-pc-linux-gnu, compiled by gcc", size: "2048" }],
        };
        expect(await probeSql(ds)).toEqual({ kind: "postgresql", role: "database", version: "16.4", usedBytes: 2048 });
    });

    it("keeps an unrecognized PostgreSQL version string as it is", async () => {
        const ds = { options: { type: "postgres" }, query: async () => [{ version: "weird build", size: "1" }] };
        expect(await probeSql(ds)).toMatchObject({ version: "weird build" });
    });

    it("reports SQLite's version", async () => {
        for (const type of ["better-sqlite3", "sqljs"]) {
            const ds = { options: { type }, query: async () => [{ version: "3.45.0" }] };
            expect(await probeSql(ds)).toEqual({ kind: "sqlite", role: "database", version: "3.45.0" });
        }
    });

    it("reports a failed query as an error", async () => {
        const ds = { options: { type: "postgres" }, query: async () => Promise.reject("connection refused") };
        expect(await probeSql(ds)).toEqual({ kind: "postgresql", role: "database", error: "connection refused" });
    });

    it("names any other driver without querying it", async () => {
        expect(await probeSql({ options: { type: "mysql" } })).toEqual({ kind: "mysql", role: "database" });
        expect(await probeSql({})).toEqual({ kind: "unknown", role: "database" });
    });
});

describe("probeRedis", () => {
    it("reports the version, memory in use and the memory ceiling", async () => {
        const info = "# Server\r\nredis_version:7.4.1\r\n# Memory\r\nused_memory:1234\r\nmaxmemory:4096\r\nnoise\r\n";
        expect(await probeRedis({ info: async () => info })).toEqual({
            kind: "redis",
            role: "cache",
            version: "7.4.1",
            usedBytes: 1234,
            totalBytes: 4096,
        });
    });

    it("leaves out a ceiling of 0 (unlimited) and figures it wasn't given", async () => {
        expect(await probeRedis({ info: async () => "redis_version:7.0.0\nmaxmemory:0\n" })).toEqual({
            kind: "redis",
            role: "cache",
            version: "7.0.0",
            usedBytes: undefined,
            totalBytes: undefined,
        });
    });

    it("reports a failure as an error", async () => {
        expect(await probeRedis({ info: async () => Promise.reject(new Error("closed")) })).toEqual({
            kind: "redis",
            role: "cache",
            error: "closed",
        });
    });
});
