// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../../../apps/shared/lib/useTheme.js";

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("useTheme()", () => {
    it("starts from the system preference when nothing is stored, and toggling applies and remembers the other scheme", () => {
        vi.stubGlobal("matchMedia", () => ({ matches: false }));
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("light");

        act(() => result.current.toggleTheme());
        expect(result.current.theme).toBe("dark");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(window.localStorage.getItem("rr-theme")).toBe("dark");

        act(() => result.current.toggleTheme());
        expect(result.current.theme).toBe("light");
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(window.localStorage.getItem("rr-theme")).toBe("light");
    });

    it("starts from the stored choice in preference to the system preference", () => {
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
        window.localStorage.setItem("rr-theme", "light");
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("light");
    });

    it("starts dark when the system prefers dark and nothing is stored", () => {
        vi.stubGlobal("matchMedia", () => ({ matches: true }));
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe("dark");
    });
});
