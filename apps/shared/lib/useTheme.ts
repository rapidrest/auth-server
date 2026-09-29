///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { useState } from "react";
import { applyTheme, clearAppliedTheme, clearStoredTheme, getStoredTheme, storeTheme, ThemePreference } from "./theme.js";

/**
 * The visitor's theme preference (`system`, `light` or `dark`) and a function to change it. The initial value is
 * the stored explicit choice, else `system`; choosing a scheme applies it to the document straight away and
 * remembers it, while choosing `system` forgets any choice so the OS preference applies again (see `theme.ts`).
 */
export function useTheme(): { preference: ThemePreference; setPreference: (preference: ThemePreference) => void } {
    const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredTheme() ?? "system");

    function setPreference(next: ThemePreference) {
        if (next === "system") {
            clearAppliedTheme();
            clearStoredTheme();
        } else {
            applyTheme(next);
            storeTheme(next);
        }
        setPreferenceState(next);
    }

    return { preference, setPreference };
}
