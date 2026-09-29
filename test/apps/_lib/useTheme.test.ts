// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "../../../apps/shared/lib/useTheme.js";

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

describe("useTheme()", () => {
    it("starts on system when nothing is stored", () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current.preference).toBe("system");
    });

    it("starts from the stored choice", () => {
        window.localStorage.setItem("rr-theme", "light");
        const { result } = renderHook(() => useTheme());
        expect(result.current.preference).toBe("light");
    });

    it("applies and remembers an explicit scheme", () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setPreference("dark"));
        expect(result.current.preference).toBe("dark");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(window.localStorage.getItem("rr-theme")).toBe("dark");

        act(() => result.current.setPreference("light"));
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(window.localStorage.getItem("rr-theme")).toBe("light");
    });

    it("forgets the choice and the applied scheme when set back to system", () => {
        const { result } = renderHook(() => useTheme());
        act(() => result.current.setPreference("dark"));

        act(() => result.current.setPreference("system"));
        expect(result.current.preference).toBe("system");
        expect(document.documentElement.dataset.theme).toBeUndefined();
        expect(window.localStorage.getItem("rr-theme")).toBeNull();
    });
});
