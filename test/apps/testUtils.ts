///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { vi } from "vitest";

/** Builds a real `Response` with a JSON body and `content-type: application/json`. */
export function jsonResponse(status: number, body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        statusText: init.statusText ?? "",
        headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(init.headers)) },
    });
}

/** Builds a real `Response` with no body and no `content-type` — the shape of e.g. a 204/logout response. */
export function emptyResponse(status: number, init: ResponseInit = {}): Response {
    return new Response(null, { status, statusText: init.statusText ?? "", headers: init.headers });
}

/**
 * Stubs `global.fetch` with the given implementation and returns the underlying mock so call args can be
 * asserted on. `apiFetch()` (the only thing in `lib/api.ts` that touches `fetch` directly) always calls
 * it as `fetch(url, init)`, never with a `Request` object, so the mock signature is narrowed to that.
 */
export function mockFetch(
    impl: (url: string, init: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
    const fn = vi.fn(impl);
    vi.stubGlobal("fetch", fn);
    return fn;
}

/**
 * Replaces `window.location` with a plain, fully-writable stub so `window.location.href = "..."` and
 * `window.location.replace(...)` can be asserted on directly — jsdom's real `Location` either throws
 * "Not implemented: navigation" or actually attempts to navigate when touched.
 */
export function mockLocation(): { href: string; replace: ReturnType<typeof vi.fn> } {
    const location = { href: "", replace: vi.fn() };
    Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: location,
    });
    return location;
}
