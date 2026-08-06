import React from "react";

export interface CodeInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
}

/** The shared 6-digit numeric verification-code input (sign-up code, sign-in TOTP/OTP, account verify-contact). */
export default function CodeInput({ id, value, onChange, placeholder = "······", required = true }: CodeInputProps) {
    return (
        <input
            id={id}
            className="rr-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={placeholder}
        />
    );
}
