///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////

export interface DatastoreInfo {
    /** `mongodb`, `postgresql`, `sqlite`, `redis`, … */
    kind: string;
    /** What the server uses it for (`database`, `cache`). */
    role: string;
    /** The version the server itself reports over its connection. */
    version?: string;
    /** Data held, as the datastore reports it: the volume's use for MongoDB, database size for SQL, memory for Redis. */
    usedBytes?: number;
    /** The capacity that `usedBytes` is measured against, when the datastore reports one. */
    totalBytes?: number;
    /** Why the datastore couldn't be queried. */
    error?: string;
}

/** Runs `probe`, turning a failure into an `error` entry so one unreachable datastore never fails the whole page. */
async function guarded(kind: string, role: string, probe: () => Promise<Partial<DatastoreInfo>>): Promise<DatastoreInfo> {
    try {
        return { kind, role, ...(await probe()) };
    } catch (err: any) {
        return { kind, role, error: err?.message ?? String(err) };
    }
}

/** MongoDB, through the framework's `MongoConnection` (`db` for `dbStats`, and `admin()` for the server's build info). */
export function probeMongo(connection: any): Promise<DatastoreInfo> {
    return guarded("mongodb", "database", async () => {
        const [info, stats] = await Promise.all([
            connection.admin().serverInfo(),
            connection.db.command({ dbStats: 1 }),
        ]);
        return {
            version: info.version,
            usedBytes: stats.fsUsedSize ?? stats.storageSize,
            totalBytes: stats.fsTotalSize,
        };
    });
}

/** A TypeORM `DataSource`: PostgreSQL (version and database size), SQLite, or just the driver name for anything else. */
export function probeSql(dataSource: any): Promise<DatastoreInfo> {
    const type: string = dataSource.options?.type ?? "unknown";
    if (type === "postgres") {
        return guarded("postgresql", "database", async () => {
            const [row] = await dataSource.query("SELECT version() AS version, pg_database_size(current_database()) AS size");
            // "PostgreSQL 16.4 on x86_64-pc-linux-gnu, compiled by …" → "16.4"
            return { version: /^PostgreSQL (\S+)/.exec(row.version)?.[1] ?? row.version, usedBytes: Number(row.size) };
        });
    }
    if (/sqlite|sqljs/.test(type)) {
        return guarded("sqlite", "database", async () => {
            const [row] = await dataSource.query("SELECT sqlite_version() AS version");
            return { version: row.version };
        });
    }
    return Promise.resolve({ kind: type, role: "database" });
}

/** Parses the `key:value` lines of Redis's `INFO` reply. */
function parseRedisInfo(info: string): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const line of info.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        if (separator > 0 && !line.startsWith("#")) {
            fields[line.slice(0, separator)] = line.slice(separator + 1);
        }
    }
    return fields;
}

/** Redis: its version, memory in use and the `maxmemory` ceiling if one is set. */
export function probeRedis(client: any): Promise<DatastoreInfo> {
    return guarded("redis", "cache", async () => {
        const fields = parseRedisInfo(await client.info());
        const maxMemory = Number(fields.maxmemory);
        return {
            version: fields.redis_version,
            usedBytes: fields.used_memory === undefined ? undefined : Number(fields.used_memory),
            totalBytes: maxMemory > 0 ? maxMemory : undefined,
        };
    });
}
