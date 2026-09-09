// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Forced onto the plain `node` environment (rather than the `jsdom` environment the rest of
// `test/apps/**` uses) via the `@vitest-environment` docblock above, so `window` is genuinely undefined
// here, the way it is under real SSR.
import { describe, expect, it } from "vitest";
import { readReturnTo } from "../../../apps/www/auth/signin.js";

describe("readReturnTo() SSR guard (no window)", () => {
    it("returns null when there is no window global", () => {
        expect(typeof window).toBe("undefined");
        expect(readReturnTo()).toBeNull();
    });
});
