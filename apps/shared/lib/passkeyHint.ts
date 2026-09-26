///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * Remembers, in this browser, which passkey was last created or used to sign in here — so the sign-in page can offer
 * exactly that one the moment it opens, without asking who's signing in first, the way most sites with passkeys do.
 *
 * An account can have several passkeys (a phone, a security key, another computer), and this device may know of only
 * some of them; what's remembered is the credential id of the one most recently created or used *from this device*,
 * so the browser is asked for that one rather than left to offer a list. If nothing is remembered there's nothing to
 * offer, and the ordinary sign-in form is shown.
 *
 * It's only a hint, never a credential: it says nothing that isn't already in the browser's own authenticator, and
 * nothing here is trusted by the server, which verifies the passkey itself. Dropped again when an automatic attempt
 * fails (the passkey was removed, the account is gone, the prompt was dismissed), so it never nags.
 */

const HINT_KEY = "rr_passkey";
const SUPPRESS_KEY = "rr_skip_passkey_prompt";

/** A passkey known to this device: its credential id, and how the authenticator reaches it, if that's known. */
export interface RememberedPasskey {
    id: string;
    transports?: string[];
}

/** Notes `passkey` as the one most recently created or used from this device, replacing whichever was noted before. */
export function rememberPasskey(passkey: RememberedPasskey): void {
    try {
        localStorage.setItem(HINT_KEY, JSON.stringify(passkey));
    } catch {
        // Storage disabled/unavailable — a best-effort convenience; sign-in itself is unaffected.
    }
}

/** The passkey most recently created or used from this device, or `null` if none is known (or the note is unreadable). */
export function getRememberedPasskey(): RememberedPasskey | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(HINT_KEY) ?? "null");
        return parsed && typeof parsed.id === "string" && parsed.id ? parsed : null;
    } catch {
        return null;
    }
}

/** Drops the note, so the sign-in page stops offering a passkey automatically. */
export function forgetPasskey(): void {
    try {
        localStorage.removeItem(HINT_KEY);
    } catch {
        // See rememberPasskey().
    }
}

/**
 * Asks the next sign-in page to *not* pop up a passkey prompt by itself, once. Set on sign-out: someone who has just
 * chosen to sign out (to switch accounts, say) shouldn't be met with a prompt to sign straight back in.
 */
export function suppressNextPasskeyPrompt(): void {
    try {
        sessionStorage.setItem(SUPPRESS_KEY, "1");
    } catch {
        // See rememberPasskey().
    }
}

/** Whether an automatic prompt was suppressed by `suppressNextPasskeyPrompt()`. Reading it clears it: it's for one visit. */
export function consumePasskeyPromptSuppression(): boolean {
    try {
        const suppressed = sessionStorage.getItem(SUPPRESS_KEY) === "1";
        sessionStorage.removeItem(SUPPRESS_KEY);
        return suppressed;
    } catch {
        return false;
    }
}
