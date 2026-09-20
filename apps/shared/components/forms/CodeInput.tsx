///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";

export interface CodeInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    /** How many digits the code has. Default 6; only a TOTP secret created with other `digits` needs more. */
    length?: number;
}

/** The shared numeric verification-code input (sign-up code, sign-in TOTP/OTP, account verify-contact) — 6 digits unless told otherwise. */
export default function CodeInput({
    id,
    value,
    onChange,
    length = 6,
    placeholder = "·".repeat(length),
    required = true,
}: CodeInputProps) {
    return (
        <input
            id={id}
            className="rr-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={placeholder}
        />
    );
}
