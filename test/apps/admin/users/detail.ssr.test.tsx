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
import UserDetailPage, { readTargetUid } from "../../../../apps/admin/users/detail/index.js";

describe("UserDetailPage SSR guard (no window)", () => {
    it("renders without throwing when there is no window global", () => {
        // Rendered via `renderToStaticMarkup` (the SSR renderer's own call) rather than
        // `@testing-library/react`'s `render()`, which requires a DOM. `AdminShell` (which every admin page
        // is wrapped in) renders only its own "checking" placeholder during SSR and never reaches this
        // page's own content, since the admin-role check itself is only ever done client-side — so this
        // doesn't exercise `readTargetUid()` (see below), only proves the outer SSR call path doesn't throw.
        expect(typeof window).toBe("undefined");
        expect(() => renderToStaticMarkup(<UserDetailPage userUid="admin-1" />)).not.toThrow();
    });

    it("readTargetUid() returns null when there is no window global", () => {
        // `readTargetUid()` runs as `UserDetailContent`'s `useState` lazy initializer, but — per the note
        // above — that component is never actually reached during SSR, so its `typeof window === "undefined"`
        // guard never runs as part of rendering the real page tree. Call it directly to exercise that path.
        expect(typeof window).toBe("undefined");
        expect(readTargetUid()).toBeNull();
    });
});
