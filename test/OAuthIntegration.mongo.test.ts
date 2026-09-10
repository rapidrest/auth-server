///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// End-to-end integration test proving the full OAuth 2.0 / OpenID Connect authorization-server wiring
// actually works together against a real (if lightweight) running server — see OAuthIntegration.sql.test.ts's
// own doc comment for the full rationale; this is its Mongo twin, matching this app's convention of
// mirroring every feature across both datastores.
vi.mock("redis", async () => {
    const { createFakeRedisModule } = await import("./helpers/FakeRedis.js");
    return createFakeRedisModule();
});

import * as crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../src/config.mongo.js";
import { Logger } from "@rapidrest/core";
import { ObjectFactory, RepoUtils, Server } from "@rapidrest/service-core";
import { agent, request } from "@rapidrest/service-core/test";
import { importArgon2, normalizePasswordSubmission, PasswordConfig } from "@rapidrest/auth";
import { AliasMongo, SecretMongo, UserMongo } from "@rapidrest/auth/mongo";
import { MongoMemoryServer } from "mongodb-memory-server";

const PASSWORD = "S3cret!Pass123";

const mongod: MongoMemoryServer = new MongoMemoryServer({
    instance: {
        port: 9999,
        dbName: "mongomemory-rrst-oauth-integration-test",
    },
});

function base64url(input: Buffer): string {
    return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("OAuth 2.0 / OIDC end-to-end integration (mongo)", () => {
    const logger = new Logger();
    const objectFactory: ObjectFactory = new ObjectFactory(config, logger);
    const server: Server = new Server({ config, basePath: "./src/mongo", logger, objectFactory });

    /**
     * Provisions a real account directly via `RepoUtils` (bypassing HTTP — `User`'s class-level ACL is
     * fully deny-all, so a bare `POST /api/users` from an anonymous caller 403s; real self-registration
     * goes through `BaseRegistrationRoute`'s OTP flow, which isn't what this test is about), then signs
     * in through the real `/api/auth/mfa` (password) endpoint via `testAgent` so its cookie jar ends up
     * holding a genuine `jwt`/session cookie — exactly what a browser would have after a normal sign-in.
     */
    async function createAndSignInUser(
        testAgent: ReturnType<typeof agent>,
        username: string,
    ): Promise<string> {
        const userRepo = await objectFactory.newInstance(RepoUtils, { name: "UserMongo", args: [UserMongo] });
        const aliasRepo = await objectFactory.newInstance(RepoUtils, { name: "AliasMongo", args: [AliasMongo] });
        const secretRepo = await objectFactory.newInstance(RepoUtils, { name: "SecretMongo", args: [SecretMongo] });

        const user = await userRepo.create({ roles: [], scopes: [], verified: true }, { ignoreACL: true });
        await aliasRepo.create({ alias: username, type: "name", userUid: user.uid, verified: true }, { ignoreACL: true });
        const argon = await importArgon2();
        // See OAuthIntegration.sql.test.ts's own comment: the server now normalizes a submitted password
        // before its own argon2 hash goes on top, so hashing PASSWORD directly here would store a hash
        // the real sign-in path below could never verify against.
        const normalized = await normalizePasswordSubmission(PASSWORD, user.uid, new PasswordConfig());
        await secretRepo.create(
            { type: "password", data: await argon.hash(normalized), userUid: user.uid },
            { ignoreACL: true },
        );

        const signInRes = await testAgent.post("/api/auth/mfa").send({ id: username, password: PASSWORD });
        if (signInRes.status !== 200) {
            throw new Error(`Sign-in failed for test setup: ${signInRes.status} ${JSON.stringify(signInRes.body)}`);
        }
        return user.uid;
    }

    beforeAll(async () => {
        await mongod.start();
        // This test's `FakeRedis` mock doesn't implement the atomic `INCREX`-based command
        // `RateLimiter` (now `@rapidrest/service-core`'s, read from the top-level `rateLimit` config
        // key rather than `auth:rateLimit`) uses against a real Redis-backed `cache` datastore — and
        // rate limiting itself isn't what this test is about (it's already covered by
        // `@rapidrest/auth`'s own suite), so it's disabled outright rather than extending the shared
        // fake for one command.
        config.set("rateLimit", { enabled: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await mongod.stop();
    });

    it(
        "registers a client, drives it through consent, exchanges the code with PKCE, verifies the " +
            "access token against JWKS, reads /userinfo, and rotates the refresh token",
        async () => {
            const issuer = config.get("auth:oauth_server:issuer");
            const redirectUri = "https://client.example.com/callback";

            // --- discovery document is self-consistent with what's actually mounted ---
            const discovery = await request(server).get("/.well-known/openid-configuration");
            expect(discovery.status).toBe(200);
            expect(discovery.body.issuer).toBe(issuer);
            expect(discovery.body.authorization_endpoint).toBe(`${issuer}/oauth/authorize`);
            expect(discovery.body.token_endpoint).toBe(`${issuer}/oauth/token`);
            expect(discovery.body.jwks_uri).toBe(`${issuer}/.well-known/jwks.json`);
            expect(discovery.body.userinfo_endpoint).toBe(`${issuer}/oauth/userinfo`);

            // --- the client's own owner registers a confidential client via the admin/owner API (Phase A) ---
            const ownerAgent = agent(server);
            await createAndSignInUser(ownerAgent, "client-owner");
            // BaseOAuthClientRoute.create() is @RequiresElevation(60)-gated, same as every other
            // sensitive mutation in this app — a plain sign-in alone isn't enough.
            const elevateRes = await ownerAgent.post("/api/auth/elevation").send({ password: PASSWORD });
            expect(elevateRes.status).toBe(200);
            const createClientRes = await ownerAgent.post("/api/oauth/clients").send({
                clientName: "Integration Test App",
                clientType: "confidential",
                redirectUris: [redirectUri],
                grantTypes: ["authorization_code", "refresh_token"],
                responseTypes: ["code"],
                scope: "openid profile email offline_access",
                tokenEndpointAuthMethod: "client_secret_post",
                requirePkce: true,
                firstParty: false,
            });
            expect(createClientRes.status).toBe(200);
            const clientId: string = createClientRes.body.uid;
            const clientSecret: string = createClientRes.body.clientSecret;
            expect(clientId).toBeTruthy();
            expect(clientSecret).toBeTruthy();
            // The plaintext secret must never round-trip on an ordinary read.
            expect(createClientRes.body.clientSecretHash).toBeUndefined();

            // --- a separate resource owner signs up and fills in a profile ---
            const resourceOwnerAgent = agent(server);
            const resourceOwnerUid = await createAndSignInUser(resourceOwnerAgent, "resource-owner");
            // A contact's `verified` flag can only ever flip via a real OTP check (see
            // BaseProfileRoute.verifyContact()) — a client-supplied `verified: true` on create is always
            // forced back to false. Complete the real verification ceremony so /userinfo's
            // `email_verified` claim reflects genuine proof, not an asserted value.
            const debugSpy = vi.spyOn(logger, "debug");
            await resourceOwnerAgent.post("/api/profiles").send({
                uid: resourceOwnerUid,
                givenName: "Ada",
                familyName: "Lovelace",
                contacts: [{ contact: "ada@example.com", type: "email", verified: true }],
            });
            const debugCall = debugSpy.mock.calls
                .map((args) => args[0])
                .find((msg) => typeof msg === "string" && msg.includes("verification code for"));
            const otpToken = (debugCall as string).match(/verification code for .*: (\S+)$/)?.[1];
            expect(otpToken).toBeTruthy();
            const verifyRes = await resourceOwnerAgent
                .post(`/api/profiles/${resourceOwnerUid}/contacts/verify`)
                .send({ contact: "ada@example.com", token: otpToken });
            expect(verifyRes.status).toBeGreaterThanOrEqual(200);
            expect(verifyRes.status).toBeLessThan(300);
            debugSpy.mockRestore();

            // --- PKCE (S256) ---
            const codeVerifier = base64url(crypto.randomBytes(48));
            const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

            // --- GET /oauth/authorize: no prior consent grant exists yet, expect the consent card ---
            // Built by hand with encodeURIComponent (%20 for a space) rather than URLSearchParams,
            // whose .toString() encodes a space as "+" — this server's query parser does not decode
            // "+" back to a space, so a URLSearchParams-built scope param would silently arrive empty.
            const authorizeParams: Record<string, string> = {
                response_type: "code",
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: "openid profile email offline_access",
                state: "xyz",
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
                nonce: "n-1",
            };
            const authorizeQuery = Object.entries(authorizeParams)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join("&");
            const authorizeRes = await resourceOwnerAgent.get(`/oauth/authorize?${authorizeQuery}`);
            expect(authorizeRes.status).toBe(200);
            expect(authorizeRes.body.consentRequired).toBe(true);
            expect(authorizeRes.body.client.clientName).toBe("Integration Test App");
            const requestId: string = authorizeRes.body.requestId;
            expect(requestId).toBeTruthy();

            // --- approve consent ---
            const consentRes = await resourceOwnerAgent
                .post("/oauth/authorize/consent")
                .send({ requestId, approved: true });
            expect(consentRes.status).toBe(200);
            const redirectTo = new URL(consentRes.body.redirectTo);
            expect(redirectTo.origin + redirectTo.pathname).toBe(redirectUri);
            expect(redirectTo.searchParams.get("state")).toBe("xyz");
            const code = redirectTo.searchParams.get("code");
            expect(code).toBeTruthy();

            // --- exchange the code for tokens (client authenticates via client_secret_post) ---
            const tokenRes = await request(server).post("/oauth/token").send({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
                code_verifier: codeVerifier,
            });
            expect(tokenRes.status).toBe(200);
            expect(tokenRes.body.token_type).toBe("Bearer");
            const accessToken: string = tokenRes.body.access_token;
            const idToken: string = tokenRes.body.id_token;
            const refreshToken: string = tokenRes.body.refresh_token;
            expect(accessToken).toBeTruthy();
            expect(idToken).toBeTruthy();
            expect(refreshToken).toBeTruthy();

            // the id_token echoes the request's own nonce and identifies the resource owner
            const idTokenClaims = jwt.decode(idToken) as any;
            expect(idTokenClaims.nonce).toBe("n-1");
            expect(idTokenClaims.sub).toBe(resourceOwnerUid);

            // --- verify the access token's signature against the live JWKS, not just decode it ---
            const jwksRes = await request(server).get("/.well-known/jwks.json");
            expect(jwksRes.status).toBe(200);
            const header = jwt.decode(accessToken, { complete: true })?.header;
            const jwk = jwksRes.body.keys.find((k: any) => k.kid === header?.kid);
            expect(jwk).toBeDefined();
            const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
            const verifiedClaims = jwt.verify(accessToken, publicKey, { algorithms: ["RS256"], issuer }) as any;
            expect(verifiedClaims.sub).toBe(resourceOwnerUid);
            expect(verifiedClaims.client_id).toBe(clientId);
            expect(verifiedClaims.scope.split(" ")).toEqual(expect.arrayContaining(["openid", "profile", "email"]));

            // --- /userinfo reflects the resource owner's actual Profile, authenticated via the bearer token alone ---
            const userInfoRes = await request(server)
                .get("/oauth/userinfo")
                .set("Authorization", `Bearer ${accessToken}`);
            expect(userInfoRes.status).toBe(200);
            expect(userInfoRes.body.sub).toBe(resourceOwnerUid);
            expect(userInfoRes.body.given_name).toBe("Ada");
            expect(userInfoRes.body.family_name).toBe("Lovelace");
            expect(userInfoRes.body.email).toBe("ada@example.com");
            expect(userInfoRes.body.email_verified).toBe(true);

            // --- refresh token rotation: redeeming it issues a new pair and retires the old one ---
            const refreshRes = await request(server).post("/oauth/token").send({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            expect(refreshRes.status).toBe(200);
            const rotatedRefreshToken: string = refreshRes.body.refresh_token;
            expect(refreshRes.body.access_token).toBeTruthy();
            expect(rotatedRefreshToken).toBeTruthy();
            expect(rotatedRefreshToken).not.toBe(refreshToken);

            // --- reusing the already-rotated-out refresh token is treated as theft and rejected ---
            const reuseRes = await request(server).post("/oauth/token").send({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            expect(reuseRes.status).toBeGreaterThanOrEqual(400);
            expect(reuseRes.body.error).toBeDefined();
        },
        30000,
    );
});
