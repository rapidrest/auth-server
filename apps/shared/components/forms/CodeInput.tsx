///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";

/**
 * The longest sent code `@rapidrest/auth` can be configured to issue (`auth:otp:length` is 4 to 64). The page doesn't
 * know the configured length, so a sent-code input only stops at this.
 */
const MAX_SENT_CODE_LENGTH = 64;

export interface CodeInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    /**
     * How long the code is. Default 6. For an authenticator (TOTP) code it's also the most digits accepted; only a TOTP
     * secret created with other `digits` needs a different value. For a sent code it only sizes the placeholder.
     */
    length?: number;
    /**
     * A code sent by e-mail, SMS or WhatsApp rather than shown by an authenticator app. `@rapidrest/auth` 3 issues those
     * as letters and digits (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` by default, length and alphabet configurable through
     * `auth:otp`), so the input accepts any character, shows it upper case and drops spaces and hyphens, the same
     * normalization the server applies. Authenticator codes are still digits only.
     */
    sent?: boolean;
}

/** Normalizes what was typed or pasted into a sent-code input the way `@rapidrest/auth`'s `verifyOTP()` does. */
export function normalizeSentCode(value: string): string {
    return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * The shared verification-code input (sign-up code, sign-in TOTP/OTP, MFA, elevation, account verify-contact). Digits
 * only (an authenticator code) unless `sent` is set, 6 characters unless told otherwise.
 */
export default function CodeInput({
    id,
    value,
    onChange,
    length = 6,
    placeholder = "·".repeat(length),
    required = true,
    sent = false,
}: CodeInputProps) {
    return (
        <input
            id={id}
            className="rr-code-input"
            inputMode={sent ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize={sent ? "characters" : undefined}
            autoCorrect={sent ? "off" : undefined}
            spellCheck={sent ? false : undefined}
            maxLength={sent ? MAX_SENT_CODE_LENGTH : length}
            required={required}
            value={value}
            onChange={(e) => onChange(sent ? normalizeSentCode(e.target.value) : e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={placeholder}
        />
    );
}
