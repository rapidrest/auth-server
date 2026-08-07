// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Covers `readTargetUid()`'s `typeof window === "undefined"` guard in `apps/admin/users/detail/index.tsx`
// — only reachable during SSR, i.e. without a DOM at all. Forced onto the plain `node` environment (rather
// than the `jsdom` environment the rest of `test/apps/**` uses) via the `@vitest-environment` docblock
// above. Rendered via `renderToStaticMarkup` (the SSR renderer's own call) rather than
// `@testing-library/react`'s `render()`, which requires a DOM.
//
// `readTargetUid()` runs as `useState`'s lazy initializer, so it always executes as part of rendering
// `UserDetailPage` — even though `AdminShell` (which every admin page is wrapped in) renders only its own
// "checking" placeholder during SSR and never reaches this page's own content, since the admin-role check
// itself is only ever done client-side. So there's nothing page-specific to assert on in the markup here;
// this test exists to prove the SSR call path doesn't throw with no `window` global.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import UserDetailPage from "../../../../apps/admin/users/detail/index.js";

describe("UserDetailPage SSR guard (no window)", () => {
    it("renders without throwing when there is no window global", () => {
        expect(typeof window).toBe("undefined");
        expect(() => renderToStaticMarkup(<UserDetailPage userUid="admin-1" />)).not.toThrow();
    });
});
