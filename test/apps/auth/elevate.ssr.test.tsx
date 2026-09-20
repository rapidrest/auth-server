// @vitest-environment node
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Forced onto the plain `node` environment (rather than the `jsdom` environment the rest of
// `test/apps/**` uses) via the `@vitest-environment` docblock above, so `window` is genuinely undefined
// here, the way it is under real SSR. The page reads `window.location` only inside effects, which never run
// server-side — this proves the first byte renders without touching it, and raises no prompt.
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isElevationRequested } from "../../../apps/shared/lib/elevation.js";
import ElevatePage from "../../../apps/www/auth/elevate.js";

describe("ElevatePage SSR (no window)", () => {
    it("renders the confirming state for a signed-in visitor without touching window", () => {
        expect(typeof window).toBe("undefined");

        const html = renderToString(<ElevatePage userUid="u1" returnToOrigins={["https://mail.mydomain.com"]} />);

        expect(html).toContain("Confirming it’s you…");
        expect(html).toContain("Complete the prompt to continue.");
        expect(isElevationRequested()).toBe(false);
    });

    it("renders the confirming state for a visitor with no session", () => {
        const html = renderToString(<ElevatePage />);

        expect(html).toContain("Checking your session");
        expect(isElevationRequested()).toBe(false);
    });
});
