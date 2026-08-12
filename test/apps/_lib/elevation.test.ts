///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { isElevationRequested, requestElevation, resolveElevation, subscribeElevation } from "../../../apps/shared/lib/elevation.js";

afterEach(() => {
    // Guard against a failed assertion leaving a prompt pending mid-test, which would otherwise leak into
    // the next test — this module holds singleton state, so each test must leave it as it found it.
    if (isElevationRequested()) {
        resolveElevation(false);
    }
});

describe("isElevationRequested", () => {
    it("is false when nothing is pending", () => {
        expect(isElevationRequested()).toBe(false);
    });
});

describe("requestElevation", () => {
    it("flips isElevationRequested to true and notifies subscribers", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeElevation(listener);

        void requestElevation();

        expect(isElevationRequested()).toBe(true);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("concurrent calls share the same promise and outcome", async () => {
        const first = requestElevation();
        const second = requestElevation();

        expect(second).toBe(first);
        resolveElevation(true);
        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    });

    it("a fresh call after resolution starts a new, independent promise", async () => {
        const first = requestElevation();
        resolveElevation(true);
        await expect(first).resolves.toBe(true);

        const second = requestElevation();
        expect(second).not.toBe(first);
        resolveElevation(false);
        await expect(second).resolves.toBe(false);
    });
});

describe("resolveElevation", () => {
    it("resolves the pending promise with true and flips isElevationRequested back to false", async () => {
        const promise = requestElevation();
        resolveElevation(true);
        await expect(promise).resolves.toBe(true);
        expect(isElevationRequested()).toBe(false);
    });

    it("resolves the pending promise with false", async () => {
        const promise = requestElevation();
        resolveElevation(false);
        await expect(promise).resolves.toBe(false);
    });

    it("notifies subscribers", () => {
        void requestElevation();
        const listener = vi.fn();
        const unsubscribe = subscribeElevation(listener);

        resolveElevation(true);

        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("is a no-op when nothing is pending", () => {
        expect(() => resolveElevation(true)).not.toThrow();
        expect(isElevationRequested()).toBe(false);
    });
});

describe("subscribeElevation", () => {
    it("stops notifying once unsubscribed", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeElevation(listener);
        unsubscribe();

        void requestElevation();

        expect(listener).not.toHaveBeenCalled();
        resolveElevation(false);
    });
});
