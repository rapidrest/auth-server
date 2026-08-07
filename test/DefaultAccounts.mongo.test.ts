///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
vi.mock("ioredis", async () => {
    const RedisMock = await import("ioredis-mock");
    return { Redis: RedisMock.default || RedisMock };
});

import config from "../src/config.mongo.js";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Logger, sleep } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { importArgon2 } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";

/** Finds the one-time password `DefaultAccounts` logs after creating a new account, if any. */
function findLoggedPassword(infoSpy: ReturnType<typeof vi.spyOn>): string | undefined {
    const line = infoSpy.mock.calls.map((args) => String(args[0])).find((l) => l.startsWith("Password: "));
    return line?.slice("Password: ".length);
}

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-defaultaccounts-test",
    },
});

describe("DefaultAccounts Tests (mongo)", () => {
    const logger = new Logger();
    const infoSpy = vi.spyOn(logger, "info");
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    beforeAll(async () => {
        await mongod.start();
    });

    afterAll(async () => {
        await mongod.stop();
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
        const aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasMongo", args: [AliasMongo] });
        const userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserMongo", args: [UserMongo] });
        const secretRepo = await objectFactory.newInstance(RepoUtils, { name: "SecretMongo", args: [SecretMongo] });

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
