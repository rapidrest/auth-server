// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Covers the `typeof window === "undefined"` guards in `lib/api.ts`'s token-storage helpers — only
// reachable when these run during SSR, i.e. without a DOM at all. Forced onto the plain `node`
// environment (rather than the `jsdom` environment the rest of `test/apps/**` uses) via the
// `@vitest-environment` docblock above, which overrides `environmentMatchGlobs` for this one file.
import { describe, expect, it } from "vitest";
import { clearAuthToken, getAuthToken, setAuthToken } from "../../../apps/www/lib/api.js";

describe("lib/api.ts SSR guards (no window)", () => {
    it("getAuthToken returns null without throwing", () => {
        expect(typeof window).toBe("undefined");
        expect(getAuthToken()).toBeNull();
    });

    it("setAuthToken is a no-op without throwing", () => {
        expect(() => setAuthToken("tok")).not.toThrow();
    });

    it("clearAuthToken is a no-op without throwing", () => {
        expect(() => clearAuthToken()).not.toThrow();
    });
});
