import React from "react";

/**
 * Inline brand-mark SVGs for the "Continue with ..." buttons in `IdentifierStep`. Kept as plain inline
 * SVG (not an icon library import) since none of `react-icons`' bundled sets cover all four consistently
 * — notably its Simple Icons set has no Microsoft mark at all (removed over trademark policy) — and a
 * button row with icons for some providers but not others would look broken.
 */

const ICON_SIZE = 18;

export function GoogleIcon() {
    return (
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
                fill="#FBBC05"
                d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
            />
        </svg>
    );
}

export function MicrosoftIcon() {
    return (
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 21 21" aria-hidden="true" focusable="false">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
    );
}

export function AppleIcon() {
    return (
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
                fill="currentColor"
                d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.24-2.98c.836-1.012 1.415-2.415 1.259-3.816-1.22.052-2.702.816-3.577 1.826-.784.899-1.474 2.338-1.291 3.716 1.325.104 2.702-.664 3.61-1.726z"
            />
        </svg>
    );
}

export function FacebookIcon() {
    return (
        <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
            <path
                fill="#1877F2"
                d="M36 18c0-9.941-8.059-18-18-18S0 8.059 0 18c0 8.981 6.581 16.42 15.187 17.771V23.203h-4.57V18h4.57v-3.967c0-4.51 2.686-7.001 6.797-7.001 1.969 0 4.028.352 4.028.352v4.428h-2.269c-2.235 0-2.934 1.387-2.934 2.81V18h4.996l-.799 5.203h-4.197v12.568C29.419 34.42 36 26.981 36 18z"
            />
        </svg>
    );
}
