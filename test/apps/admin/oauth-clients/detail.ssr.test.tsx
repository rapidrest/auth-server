// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Forced onto the plain `node` environment (rather than the `jsdom` environment the rest of
// `test/apps/**` uses) via the `@vitest-environment` docblock above, so `window` is genuinely undefined
// here, the way it is under real SSR.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OAuthClientDetailPage, { readTargetUid } from "../../../../apps/admin/oauth-clients/detail/index.js";

describe("OAuthClientDetailPage SSR guard (no window)", () => {
    it("renders without throwing when there is no window global", () => {
        // See `apps/admin/users/detail/index.tsx`'s own SSR test for why this never actually reaches
        // `readTargetUid()` — `AdminShell` renders only its "checking" placeholder during SSR.
        expect(typeof window).toBe("undefined");
        expect(() => renderToStaticMarkup(<OAuthClientDetailPage userUid="admin-1" />)).not.toThrow();
    });

    it("readTargetUid() returns null when there is no window global", () => {
        expect(typeof window).toBe("undefined");
        expect(readTargetUid()).toBeNull();
    });
});
