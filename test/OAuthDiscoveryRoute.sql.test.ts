///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `OAuthDiscoveryRoute`'s `endpoints` getter, in
// isolation from a live `ObjectFactory`. `Server.sql.test.ts` already exercises route registration
// end-to-end, but never calls the discovery endpoint itself.
import { describe, expect, it } from "vitest";
import { OAuthDiscoveryRoute } from "../src/sql/routes/OAuthDiscoveryRoute.js";

describe("OAuthDiscoveryRoute (sql)", () => {
    it("builds every endpoint URL from the configured issuer", () => {
        const route = new OAuthDiscoveryRoute();
        (route as any).issuer = "https://auth.example.com";

        expect((route as any).endpoints).toEqual({
            authorization: "https://auth.example.com/oauth/authorize",
            token: "https://auth.example.com/oauth/token",
            jwks: "https://auth.example.com/.well-known/jwks.json",
            userinfo: "https://auth.example.com/oauth/userinfo",
            revocation: "https://auth.example.com/oauth/revoke",
            introspection: "https://auth.example.com/oauth/introspect",
        });
    });

    it("falls back to an empty prefix when issuer is unset", () => {
        const route = new OAuthDiscoveryRoute();

        expect((route as any).endpoints.authorization).toBe("/oauth/authorize");
    });
});
