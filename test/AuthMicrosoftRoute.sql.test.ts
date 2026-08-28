///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `AuthMicrosoftRoute.login()`'s pass-through to
// `BaseAuthOIDCRoute`, in isolation from a live `ObjectFactory`/database. `Server.sql.test.ts`
// already exercises route registration end-to-end, but never calls `login()` itself since that
// requires a full third-party OAuth code exchange with Microsoft.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAuthOIDCRoute } from "@rapidrest/auth";
import { AuthMicrosoftRoute } from "../src/sql/routes/AuthMicrosoftRoute.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AuthMicrosoftRoute (sql)", () => {
    it("delegates login() to the base OIDC route", async () => {
        const expected = { data: "token", method: "microsoft", payload: "token", user: { uid: "u1" } };
        const loginSpy = vi.spyOn(BaseAuthOIDCRoute.prototype as any, "login").mockResolvedValue(expected);
        const route = new AuthMicrosoftRoute();
        const user = { uid: "u1" } as any;
        const req = {} as any;
        const res = {} as any;

        const result = await route.login(user, req, res);

        expect(loginSpy).toHaveBeenCalledWith(user, req, res);
        expect(result).toBe(expected);
    });
});
