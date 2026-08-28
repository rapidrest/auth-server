///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `AuthAppleRoute`'s own logic — the client_secret JWT
// caching in `getClientSecret()` and the `login()` pass-through to `BaseAuthOIDCRoute` — in isolation
// from a live `ObjectFactory`/database. `Server.sql.test.ts` already exercises route registration
// (which reads `providerConfig` once) end-to-end, but never calls `login()` itself since that requires
// a full third-party OAuth code exchange with Apple.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAuthOIDCRoute } from "@rapidrest/auth";
import { AuthAppleRoute } from "../src/sql/routes/AuthAppleRoute.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AuthAppleRoute (sql)", () => {
    it("delegates login() to the base OIDC route", async () => {
        const expected = { data: "token", method: "apple", payload: "token", user: { uid: "u1" } };
        const loginSpy = vi.spyOn(BaseAuthOIDCRoute.prototype as any, "login").mockResolvedValue(expected);
        const route = new AuthAppleRoute();
        const user = { uid: "u1" } as any;
        const req = {} as any;
        const res = {} as any;

        const result = await route.login(user, req, res);

        expect(loginSpy).toHaveBeenCalledWith(user, req, res);
        expect(result).toBe(expected);
    });

    it("caches the generated client_secret JWT across calls instead of resigning it on every request", () => {
        const route = new AuthAppleRoute();

        const first = (route as any).providerConfig.clientSecret;
        const second = (route as any).providerConfig.clientSecret;

        expect(second).toBe(first);
    });
});
