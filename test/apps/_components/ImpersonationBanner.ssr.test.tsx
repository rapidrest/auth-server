// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Forced onto the plain `node` environment (rather than `jsdom`) so `window` is genuinely undefined here,
// the way it is under real SSR — see `test/apps/admin/users/detail.ssr.test.tsx`'s own doc comment for why
// this matters: `localStorage` doesn't exist in Node, so `isImpersonating()`'s `typeof window === "undefined"`
// guard is what keeps `ImpersonationBanner`'s `useState(isImpersonating)` lazy initializer from throwing
// when this component is actually reached during SSR (unlike `AdminShell`'s pages, `AuthShell`'s children —
// e.g. `apps/www/account` — render for real on the server whenever the request already carries a valid
// session cookie).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isImpersonating } from "../../../apps/shared/lib/api.js";
import ImpersonationBanner from "../../../apps/shared/components/impersonation/ImpersonationBanner.js";

describe("ImpersonationBanner SSR guard (no window)", () => {
    it("isImpersonating() returns false when there is no window global", () => {
        expect(typeof window).toBe("undefined");
        expect(isImpersonating()).toBe(false);
    });

    it("renders without throwing when there is no window global", () => {
        expect(typeof window).toBe("undefined");
        expect(() => renderToStaticMarkup(<ImpersonationBanner />)).not.toThrow();
        expect(renderToStaticMarkup(<ImpersonationBanner />)).toBe("");
    });
});
