// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    downloadText,
    formatBytes,
    formatCores,
    formatDuration,
    formatPercent,
    fraction,
} from "../../../apps/shared/lib/diagnostics.js";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { getRuntime, getSystem, getVersions } from "../../../apps/shared/lib/diagnosticsApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("formatBytes", () => {
    it.each([
        [0, "0 B"],
        [512, "512 B"],
        [1536, "1.5 KiB"],
        [128 * 1024 ** 2, "128 MiB"],
        [5.25 * 1024 ** 3, "5.3 GiB"],
        [1024 ** 4, "1.0 TiB"],
        [3 * 1024 ** 6, "3072 PiB"],
    ])("formats %d as %s", (bytes, expected) => {
        expect(formatBytes(bytes)).toBe(expected);
    });

    it("shows an em dash for a figure that wasn't reported", () => {
        expect(formatBytes(undefined)).toBe("—");
    });
});

describe("formatCores", () => {
    it("writes fractions of a core in millicores and whole cores in decimals", () => {
        expect(formatCores(0.25)).toBe("250m");
        expect(formatCores(0.0004)).toBe("0m");
        expect(formatCores(1.5)).toBe("1.50");
        expect(formatCores(undefined)).toBe("—");
    });
});

describe("formatPercent / formatDuration / fraction", () => {
    it("formats a percentage to one decimal", () => {
        expect(formatPercent(12.345)).toBe("12.3%");
    });

    it("formats a duration to its two most significant units", () => {
        expect(formatDuration(12.9)).toBe("12s");
        expect(formatDuration(75)).toBe("1m 15s");
        expect(formatDuration(3700)).toBe("1h 1m");
        expect(formatDuration(93784)).toBe("1d 2h");
    });

    it("measures how full something is, clamped to 0..1, or nothing without a capacity", () => {
        expect(fraction(25, 100)).toBe(0.25);
        expect(fraction(200, 100)).toBe(1);
        expect(fraction(-5, 100)).toBe(0);
        expect(fraction(undefined, 100)).toBeUndefined();
        expect(fraction(5, undefined)).toBeUndefined();
        expect(fraction(5, 0)).toBeUndefined();
    });
});

describe("downloadText", () => {
    it("hands the text to the browser as a named file and cleans up after itself", () => {
        let blob: Blob | undefined;
        const create = vi.fn((b: Blob) => {
            blob = b;
            return "blob:mock";
        });
        const revoke = vi.fn();
        Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            expect(this.href).toBe("blob:mock");
            expect(this.download).toBe("out.log");
            expect(document.body.contains(this)).toBe(true);
        });

        downloadText("out.log", "hello", "text/x-test");

        expect(click).toHaveBeenCalledTimes(1);
        expect(blob!.type).toBe("text/x-test");
        expect(revoke).toHaveBeenCalledWith("blob:mock");
        expect(document.querySelector("a[download]")).toBeNull();
    });

    it("defaults to plain text", () => {
        let blob: Blob | undefined;
        Object.assign(URL, {
            createObjectURL: (b: Blob) => {
                blob = b;
                return "blob:mock";
            },
            revokeObjectURL: vi.fn(),
        });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
        downloadText("out.log", "hello");
        expect(blob!.type).toBe("text/plain");
    });
});

describe("diagnostics API", () => {
    it("fetches each endpoint under /api/diagnostics", async () => {
        const fetchMock = mockFetch((url) => jsonResponse(200, { url }));
        expect(await getVersions()).toEqual({ url: "/api/diagnostics/versions" });
        expect(await getRuntime()).toEqual({ url: "/api/diagnostics/runtime" });
        expect(await getSystem()).toEqual({ url: "/api/diagnostics/system" });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
