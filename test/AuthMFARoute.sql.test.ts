///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Unit-level (not integration) coverage for `AuthMFARoute.initialize()`'s own logic, in isolation from
// `BaseAuthMFARouteSQL`'s real `initialize()` — which requires a live `ObjectFactory`/database and is
// already exercised end-to-end by `Server.sql.test.ts`. That integration path only ever hits the
// `if (strategy)` true branch below (base `initialize()` always registers a "mfa"-named strategy when it
// doesn't throw), so the false branch was previously an uncovered defensive guard. Stubbing out the base
// class's `initialize()` lets both branches be driven directly and cheaply.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAuthMFARouteSQL } from "@rapidrest/auth/sql";
import { AuthMFARoute } from "../src/sql/routes/AuthMFARoute.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AuthMFARoute (sql) — initialize()", () => {
    it("drives the registered 'mfa' strategy's require2FA from auth:require_mfa when the strategy is found", async () => {
        vi.spyOn(BaseAuthMFARouteSQL.prototype, "initialize").mockResolvedValue(undefined);
        const route = new AuthMFARoute();
        const strategy = { options: { require2FA: true } };
        (route as any).authMiddleware = { strategies: new Map([["mfa", strategy]]) };
        (route as any).jwtConfig = { require_mfa: false };

        await (route as any).initialize();

        expect(strategy.options.require2FA).toBe(false);
    });

    it("forces require2FA on when auth:require_mfa is set", async () => {
        vi.spyOn(BaseAuthMFARouteSQL.prototype, "initialize").mockResolvedValue(undefined);
        const route = new AuthMFARoute();
        const strategy = { options: { require2FA: false } };
        (route as any).authMiddleware = { strategies: new Map([["mfa", strategy]]) };
        (route as any).jwtConfig = { require_mfa: true };

        await (route as any).initialize();

        expect(strategy.options.require2FA).toBe(true);
    });

    it("does nothing (and does not throw) when no 'mfa' strategy is registered", async () => {
        vi.spyOn(BaseAuthMFARouteSQL.prototype, "initialize").mockResolvedValue(undefined);
        const route = new AuthMFARoute();
        (route as any).authMiddleware = { strategies: new Map() };
        (route as any).jwtConfig = { require_mfa: true };

        await expect((route as any).initialize()).resolves.toBeUndefined();
    });
});
