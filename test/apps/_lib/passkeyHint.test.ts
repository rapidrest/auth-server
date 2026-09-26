// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    consumePasskeyPromptSuppression,
    forgetPasskey,
    getRememberedPasskey,
    rememberPasskey,
    suppressNextPasskeyPrompt,
} from "../../../apps/shared/lib/passkeyHint.js";

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe("getRememberedPasskey", () => {
    it("returns null when nothing has been remembered", () => {
        expect(getRememberedPasskey()).toBeNull();
    });

    it("returns the passkey most recently remembered, with how to reach it when that's known", () => {
        rememberPasskey({ id: "a", transports: ["internal"] });
        expect(getRememberedPasskey()).toEqual({ id: "a", transports: ["internal"] });
    });

    it("remembers one passkey at a time: the newest replaces the older", () => {
        rememberPasskey({ id: "old", transports: ["usb"] });
        rememberPasskey({ id: "new" });
        expect(getRememberedPasskey()).toEqual({ id: "new" });
    });

    it.each([
        ["something that isn't JSON", "not json"],
        ["JSON null", "null"],
        ["a JSON value with no id", '{"transports":["usb"]}'],
        ["an empty id", '{"id":""}'],
        ["a non-string id", '{"id":5}'],
        ["a bare number", "5"],
    ])("treats %s as nothing remembered", (_label, stored) => {
        localStorage.setItem("rr_passkey", stored);
        expect(getRememberedPasskey()).toBeNull();
    });

    it("returns null when storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        expect(getRememberedPasskey()).toBeNull();
    });
});

describe("rememberPasskey / forgetPasskey", () => {
    it("forgets what was remembered", () => {
        rememberPasskey({ id: "a" });
        forgetPasskey();
        expect(getRememberedPasskey()).toBeNull();
    });

    it("do nothing worse than nothing when storage is unavailable (e.g. disabled/private browsing)", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        expect(() => rememberPasskey({ id: "a" })).not.toThrow();
        expect(() => forgetPasskey()).not.toThrow();
    });
});

describe("suppressNextPasskeyPrompt / consumePasskeyPromptSuppression", () => {
    it("is not suppressed unless asked", () => {
        expect(consumePasskeyPromptSuppression()).toBe(false);
    });

    it("suppresses exactly one prompt: reading it clears it", () => {
        suppressNextPasskeyPrompt();
        expect(consumePasskeyPromptSuppression()).toBe(true);
        expect(consumePasskeyPromptSuppression()).toBe(false);
    });

    it("leaves what's remembered alone", () => {
        rememberPasskey({ id: "a" });
        suppressNextPasskeyPrompt();
        consumePasskeyPromptSuppression();
        expect(getRememberedPasskey()).toEqual({ id: "a" });
    });

    it("do nothing worse than nothing when storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });
        expect(() => suppressNextPasskeyPrompt()).not.toThrow();
        expect(consumePasskeyPromptSuppression()).toBe(false);
    });
});
