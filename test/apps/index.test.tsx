// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockLocation } from "./testUtils.js";
import HomePage from "../../apps/www/index.js";

describe("HomePage", () => {
    it("redirects to /account when a userUid is present", () => {
        const location = mockLocation();
        render(<HomePage userUid="u1" />);
        expect(location.replace).toHaveBeenCalledWith("/account");
    });

    it("redirects to /auth/signin when there is no userUid", () => {
        const location = mockLocation();
        render(<HomePage />);
        expect(location.replace).toHaveBeenCalledWith("/auth/signin");
    });

    it("includes a noscript meta-refresh fallback pointing at the same target", () => {
        // `useEffect`'s redirect never runs during SSR, so the `<noscript>` fallback is what a
        // JS-disabled browser actually uses — rendered here via `renderToStaticMarkup` (what the real
        // SSR path calls) rather than `render()`, since React deliberately omits `<noscript>` children
        // from the live DOM once client-side scripting is active.
        const html = renderToStaticMarkup(<HomePage userUid="u1" />);
        expect(html).toContain("<noscript>");
        expect(html).toContain("0;url=/account");
    });
});
