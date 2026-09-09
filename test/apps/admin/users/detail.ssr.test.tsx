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
import UserDetailPage from "../../../../apps/admin/users/[uid].js";

describe("UserDetailPage SSR guard (no window)", () => {
    it("renders without throwing when there is no window global", () => {
        // `AdminShell` renders only its own "checking" placeholder during SSR (the admin-role check
        // itself is only ever done client-side), so this never actually reaches `params.uid`, only
        // proves the outer SSR call path doesn't throw.
        expect(typeof window).toBe("undefined");
        expect(() => renderToStaticMarkup(<UserDetailPage userUid="admin-1" params={{ uid: "target-1" }} />)).not.toThrow();
    });
});
