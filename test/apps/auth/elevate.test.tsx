// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, listElevationMethods: vi.fn(), refreshAccessToken: vi.fn() };
});

import { listElevationMethods, refreshAccessToken } from "../../../apps/shared/lib/api.js";
import { isElevationRequested, resolveElevation } from "../../../apps/shared/lib/elevation.js";
import ElevatePage from "../../../apps/www/auth/elevate.js";

const mockedListElevationMethods = vi.mocked(listElevationMethods);
const mockedRefreshAccessToken = vi.mocked(refreshAccessToken);
const AUTH_RESULT = { token: "tok", user: { uid: "u1", version: 1, roles: [], scopes: [] } };
const TRUSTED = ["https://mail.mydomain.com"];

/** A writable stand-in for `window.location` — see `mockLocation()` in `testUtils.ts` — with the parts this page reads. */
function stubLocation(search: string) {
    const location = { pathname: "/auth/elevate", search, href: "", replace: vi.fn(), reload: vi.fn() };
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: location });
    return location;
}

function withReturnTo(target: string): string {
    return `?return_to=${encodeURIComponent(target)}`;
}

beforeEach(() => {
    // The prompt itself (`ElevationHost`, mounted by `AuthShell`) loads the caller's methods once it opens; what it
    // then shows is covered by its own tests, so leave it waiting.
    mockedListElevationMethods.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
    // Whatever a test left open must not leak into the next one — the elevation broker is module-level state.
    if (isElevationRequested()) {
        act(() => resolveElevation(false));
    }
    mockedRefreshAccessToken.mockReset();
    mockedListElevationMethods.mockReset();
});

describe("ElevatePage — signed in", () => {
    it("opens the elevation prompt straight away and shows a confirming state behind it", async () => {
        const location = stubLocation(withReturnTo("https://mail.mydomain.com/admin"));

        render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);

        expect(screen.getByRole("status")).toHaveTextContent("Confirming it’s you…");
        expect(screen.getByRole("status")).toHaveTextContent("Complete the prompt to continue.");
        await waitFor(() => expect(isElevationRequested()).toBe(true));
        await waitFor(() => expect(mockedListElevationMethods).toHaveBeenCalled());
        await act(async () => undefined);
        // Nothing has happened yet, and a signed-in visitor is never bounced through a session refresh.
        expect(location.href).toBe("");
        expect(mockedRefreshAccessToken).not.toHaveBeenCalled();
        expect(location.replace).not.toHaveBeenCalled();
    });

    it("only raises one prompt however often it re-renders", async () => {
        stubLocation(withReturnTo("/account/security"));
        const { rerender } = render(<ElevatePage userUid="u1" />);
        await waitFor(() => expect(isElevationRequested()).toBe(true));

        rerender(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);

        expect(isElevationRequested()).toBe(true);
        act(() => resolveElevation(false));
        expect(isElevationRequested()).toBe(false);
    });

    describe("once elevated", () => {
        async function elevate(): Promise<void> {
            await waitFor(() => expect(isElevationRequested()).toBe(true));
            act(() => resolveElevation(true));
        }

        it("goes back to the return_to URL when its origin is trusted", async () => {
            const target = "https://mail.mydomain.com/admin?tab=users#top";
            const location = stubLocation(withReturnTo(target));
            render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);

            await elevate();

            await waitFor(() => expect(location.href).toBe(target));
        });

        it("goes back to a same-origin path in return_to even with no trusted origins configured", async () => {
            const location = stubLocation(withReturnTo("/account/security"));
            render(<ElevatePage userUid="u1" />);

            await elevate();

            await waitFor(() => expect(location.href).toBe("/account/security"));
        });

        it("accepts the older returnTo spelling too", async () => {
            const location = stubLocation(`?returnTo=${encodeURIComponent("/account/security")}`);
            render(<ElevatePage userUid="u1" />);

            await elevate();

            await waitFor(() => expect(location.href).toBe("/account/security"));
        });

        it.each([
            ["an origin that isn't trusted", "https://evil.com/phish"],
            ["a lookalike host", "https://mail.mydomain.com.evil.com/"],
            ["a userinfo trick", "https://mail.mydomain.com@evil.com/"],
            ["a protocol-relative URL", "//evil.com"],
            ["a backslash-relative URL", "/\\evil.com"],
            ["a script URL", "javascript:alert(1)"],
            ["a bare relative path", "admin"],
        ])("goes to /account instead of %s", async (_label, target) => {
            const location = stubLocation(withReturnTo(target));
            render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);

            await elevate();

            await waitFor(() => expect(location.href).toBe("/account"));
        });

        it("goes to /account for an absolute return_to when no origins are configured at all", async () => {
            const location = stubLocation(withReturnTo("https://mail.mydomain.com/"));
            render(<ElevatePage userUid="u1" />);

            await elevate();

            await waitFor(() => expect(location.href).toBe("/account"));
        });

        it("goes to /account when there is no return_to", async () => {
            const location = stubLocation("");
            render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);

            await elevate();

            await waitFor(() => expect(location.href).toBe("/account"));
        });
    });

    describe("when the prompt is cancelled", () => {
        it("goes to /account, not back to a trusted return_to that would only raise the prompt again", async () => {
            const location = stubLocation(withReturnTo("https://mail.mydomain.com/admin"));
            render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);
            await waitFor(() => expect(isElevationRequested()).toBe(true));

            act(() => resolveElevation(false));

            await waitFor(() => expect(location.href).toBe("/account"));
        });

        it("goes to /account when there is no return_to either", async () => {
            const location = stubLocation("");
            render(<ElevatePage userUid="u1" />);
            await waitFor(() => expect(isElevationRequested()).toBe(true));

            act(() => resolveElevation(false));

            await waitFor(() => expect(location.href).toBe("/account"));
        });
    });

    it("does not navigate if the page is gone by the time the prompt settles", async () => {
        const location = stubLocation(withReturnTo("https://mail.mydomain.com/admin"));
        const { unmount } = render(<ElevatePage userUid="u1" returnToOrigins={TRUSTED} />);
        await waitFor(() => expect(isElevationRequested()).toBe(true));

        unmount();
        act(() => resolveElevation(true));
        await Promise.resolve();
        await Promise.resolve();

        expect(location.href).toBe("");
    });
});

describe("ElevatePage — no session", () => {
    it("does not raise the elevation prompt", async () => {
        stubLocation(withReturnTo("https://mail.mydomain.com/admin"));
        mockedRefreshAccessToken.mockReturnValue(new Promise(() => undefined));

        render(<ElevatePage returnToOrigins={TRUSTED} />);

        expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
        await waitFor(() => expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1));
        expect(isElevationRequested()).toBe(false);
    });

    it("sends the visitor to sign-in with this page's own URL, return_to included, to come back to", async () => {
        const target = "https://mail.mydomain.com/admin?tab=users";
        const location = stubLocation(withReturnTo(target));
        mockedRefreshAccessToken.mockRejectedValueOnce(new Error("no refresh token"));

        render(<ElevatePage returnToOrigins={TRUSTED} />);

        const own = `/auth/elevate?return_to=${encodeURIComponent(target)}`;
        await waitFor(() => expect(location.replace).toHaveBeenCalledWith(`/auth/signin?return_to=${encodeURIComponent(own)}`));
        expect(location.href).toBe("");
        expect(isElevationRequested()).toBe(false);
    });

    it("still sends the visitor to sign-in, back to this page, when there is no return_to", async () => {
        const location = stubLocation("");
        mockedRefreshAccessToken.mockRejectedValueOnce(new Error("no refresh token"));

        render(<ElevatePage />);

        await waitFor(() =>
            expect(location.replace).toHaveBeenCalledWith(`/auth/signin?return_to=${encodeURIComponent("/auth/elevate")}`),
        );
    });

    it("reloads to pick up the session when the silent refresh succeeds", async () => {
        const location = stubLocation(withReturnTo("/account"));
        mockedRefreshAccessToken.mockResolvedValueOnce(AUTH_RESULT);

        render(<ElevatePage />);

        await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1));
        expect(location.replace).not.toHaveBeenCalled();
    });
});
