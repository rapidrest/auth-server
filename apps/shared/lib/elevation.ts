///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Global broker that lets `apiFetch` (see `api.ts`) hand off to a UI prompt whenever the backend responds
 * with `AUTH_REQUIRES_ELEVATION` (`api-104`), without either module depending on the other's internals.
 * Deliberately framework-free (no React import) so `api.ts` — used from plain functions as well as
 * components — can call `requestElevation()` directly; `ElevationHost` is the one React component that
 * subscribes to this store and actually renders the prompt.
 *
 * At most one elevation prompt is ever in flight at a time: if several API calls fail with `api-104`
 * concurrently (e.g. a page firing off a few requests at once), they all call `requestElevation()` and all
 * receive the *same* promise, so the user sees a single prompt and every waiting call resolves together
 * once it's resolved.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let activePromise: Promise<boolean> | null = null;
let resolveActivePromise: ((elevated: boolean) => void) | null = null;

function notify(): void {
    listeners.forEach((listener) => listener());
}

/** Subscribed to by `ElevationHost` via `useSyncExternalStore` to know when to render the prompt. */
export function subscribeElevation(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** The `useSyncExternalStore` snapshot: whether a prompt is currently pending. */
export function isElevationRequested(): boolean {
    return activePromise !== null;
}

/**
 * Called by `apiFetch` when a request fails with `AUTH_REQUIRES_ELEVATION`. Resolves `true` once the user
 * has successfully completed an elevation challenge (the caller should retry its original request) or
 * `false` if they cancelled (the caller should surface the original error instead).
 */
export function requestElevation(): Promise<boolean> {
    if (!activePromise) {
        // Captured in a local rather than read back from `activePromise` below: a subscriber (e.g. a test,
        // or a synchronous resolveElevation() call from within the notify() below) can resolve and clear
        // `activePromise` before this function returns, since `notify()` calls listeners synchronously.
        const promise = new Promise<boolean>((resolve) => {
            resolveActivePromise = resolve;
        });
        activePromise = promise;
        notify();
        return promise;
    }
    return activePromise;
}

/** Called by `ElevationHost` once the prompt is resolved (success or user cancellation). */
export function resolveElevation(elevated: boolean): void {
    resolveActivePromise?.(elevated);
    activePromise = null;
    resolveActivePromise = null;
    notify();
}
