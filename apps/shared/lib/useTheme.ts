///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useState } from "react";
import { applyTheme, resolveTheme, storeTheme, Theme } from "./theme.js";

/**
 * The active color scheme and a function to flip it. The initial value follows the visitor's stored choice,
 * else the OS preference (see `resolveTheme()`); flipping applies the other scheme to the document straight
 * away and remembers it for next time (see `theme.ts`).
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
    const [theme, setTheme] = useState<Theme>(resolveTheme);

    function toggleTheme() {
        const next: Theme = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        storeTheme(next);
        setTheme(next);
    }

    return { theme, toggleTheme };
}
