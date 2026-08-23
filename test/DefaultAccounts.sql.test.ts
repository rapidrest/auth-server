///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import config from "../src/config.sql.js";
import { Logger, sleep } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { importArgon2 } from "@rapidrest/auth";
import { AliasSQL, SecretSQL, UserSQL } from "@rapidrest/auth/sql";
import * as fs from "fs";
import * as sqlite3 from "sqlite3";

// A `:memory:` sqlite database only lives as long as the connection that opened it — `server.stop()`
// destroys that connection (via `ConnectionManager.disconnect()`), so a subsequent `server.start()`
// reconnects to a brand-new, empty database. That defeats the "does not recreate the account on a
// second startup" test below, which depends on data surviving a stop/start cycle (as it would for a
// real sqlite deployment, and as mongodb-memory-server's out-of-process mongod already does for the
// mongo equivalent of this test). Use a file-backed database instead so the data actually persists.
const DB_FILE = "rrst-test-default-accounts";
// The "acl" and "sql" datastores each open their own native connection - better-sqlite3 (unlike the
// old `sqlite3`-backed "sqlite" driver) takes an exclusive lock on every write, so two connections
// sharing one file collide with a "database is locked" error the moment their startup schema syncs
// overlap. Giving "acl" its own file sidesteps that; ACL and SQL storage don't need to be colocated.
const ACL_DB_FILE = "rrst-test-default-accounts-acl";
const sqlite: sqlite3.Database = new sqlite3.Database(":memory:");

/** Finds the one-time password `DefaultAccounts` logs after creating a new account, if any. Strips
 * the single quotes DefaultAccounts wraps the password in (`Password: '<password>'`). */
function findLoggedPassword(infoSpy: ReturnType<typeof vi.spyOn>): string | undefined {
    const line = infoSpy.mock.calls.map((args) => String(args[0])).find((l) => l.startsWith("Password: '"));
    return line?.slice("Password: '".length, -1);
}

describe("DefaultAccounts Tests (sql)", () => {
    const logger = new Logger();
    const infoSpy = vi.spyOn(logger, "info");
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/sql", logger, objectFactory });

    beforeAll(async () => {
        // DefaultAccounts only logs the raw one-time password when no password file is configured -
        // otherwise it writes the password to that file and logs just "Password: See '<path>'". This
        // test asserts against the logged value directly, so disable the password file here.
        config.set("auth:password_file", "");
        config.set("datastores:acl", {
            type: "better-sqlite3",
            host: "localhost",
            database: ACL_DB_FILE,
            synchronize: true,
        });
        config.set("datastores:sql", {
            type: "better-sqlite3",
            host: "localhost",
            database: DB_FILE,
            synchronize: true,
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            sqlite.close((err) => {
                if (err) {
                    throw new Error(err.message);
                }
                resolve();
            });
        });
        for (const file of [DB_FILE, ACL_DB_FILE]) {
            await fs.promises.rm(file, { force: true });
        }
    });

    afterEach(async () => {
        await server.stop();
    });

    it("creates a default admin account on startup and logs its one-time password", async () => {
        await server.start();
        // The job runs once, synchronously as part of BackgroundServiceManager.startAll() during
        // server.start() — give it a moment to finish writing the user/alias/secret records.
        await sleep(1000);

        const password = findLoggedPassword(infoSpy);
        expect(password).toBeDefined();
        expect(password!.length).toBeGreaterThan(0);

        // Prove the account is actually usable, not just logged — look up the created records directly
        // (rather than through the HTTP `/auth/password` route) and verify the stored hash matches the
        // logged password with the same argon2 verification the sign-in route itself uses.
        const aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasSQL", args: [AliasSQL] });
        const userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserSQL", args: [UserSQL] });
        const secretRepo = await objectFactory.newInstance(RepoUtils, { name: "SecretSQL", args: [SecretSQL] });

        const aliases = await aliasRepo.find({ alias: "admin", type: "name" }, { ignoreACL: true });
        expect(aliases).toHaveLength(1);
        const user = await userRepo.findOne(aliases[0].userUid, { ignoreACL: true });
        expect(user).toBeDefined();
        expect(user!.roles).toContain("admin");

        const secrets = await secretRepo.find({ type: "password", userUid: user!.uid }, { ignoreACL: true });
        expect(secrets).toHaveLength(1);
        const argon = await importArgon2();
        await expect(argon.verify(secrets[0].data, password!)).resolves.toBe(true);
    });

    it("does not recreate the account (or log a new password) on a second startup", async () => {
        await server.start();
        await sleep(1000);
        await server.stop();
        infoSpy.mockClear();

        await server.start();
        await sleep(1000);

        expect(findLoggedPassword(infoSpy)).toBeUndefined();
    });
});
