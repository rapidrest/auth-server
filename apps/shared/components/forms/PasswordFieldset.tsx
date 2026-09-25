///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { isPasswordValid, PasswordCriteriaList, type PasswordCriterion } from "../../lib/passwordCriteria.js";
import Button from "../buttons/Button.js";

export interface PasswordFieldsetProps {
    id: string;
    label: string;
    confirmId: string;
    confirmLabel: string;
    value: string;
    onChange: (value: string) => void;
    confirmValue: string;
    onConfirmChange: (value: string) => void;
    criteria: PasswordCriterion[];
    /** Shown below the password field only while it's empty (e.g. "Leave blank to add one later"). Omit for none. */
    emptyHint?: string;
    /** Whether the confirm field renders even while the password field is still empty. Default true. */
    showConfirmWhenEmpty?: boolean;
    /**
     * Offers a "Generate" button that calls this, which is expected to fill both fields with a new password. Also adds
     * Show/Hide and Copy, since whoever asks for a generated password has to be able to read it (to pass it on) —
     * the fields switch to plain text when one is generated. Omit for none of these.
     */
    onGenerate?: () => void;
}

/**
 * New-password + confirm-password fields with the live criteria checklist and mismatch message.
 * Stays fully controlled — state ownership (and therefore validity-gated submit behavior) is unchanged
 * from the call site, this only removes the duplicated JSX between sign-up's profile step and account's
 * add-password form.
 */
export default function PasswordFieldset({
    id,
    label,
    confirmId,
    confirmLabel,
    value,
    onChange,
    confirmValue,
    onConfirmChange,
    criteria,
    emptyHint,
    showConfirmWhenEmpty = true,
    onGenerate,
}: PasswordFieldsetProps) {
    const mismatch = confirmValue.length > 0 && confirmValue !== value;
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputType = revealed ? "text" : "password";

    function handleGenerate() {
        onGenerate?.();
        setRevealed(true);
        setCopied(false);
    }

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            // Clipboard unavailable or denied — the password is on screen (Show), so it can still be copied by hand.
        }
    }

    return (
        <>
            <div className="rr-field">
                <label htmlFor={id}>{label}</label>
                <input
                    id={id}
                    className="rr-input"
                    type={inputType}
                    autoComplete="new-password"
                    aria-invalid={value.length > 0 && !isPasswordValid(value, criteria)}
                    value={value}
                    onChange={(e) => {
                        setCopied(false);
                        onChange(e.target.value);
                    }}
                />
                {onGenerate && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={handleGenerate}>
                            Generate
                        </Button>
                        <Button
                            variant="secondary"
                            type="button"
                            style={{ width: "auto" }}
                            aria-pressed={revealed}
                            onClick={() => setRevealed((r) => !r)}
                        >
                            {revealed ? "Hide" : "Show"}
                        </Button>
                        {value.length > 0 && (
                            <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={handleCopy}>
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        )}
                    </div>
                )}
                {value.length > 0 ? (
                    <PasswordCriteriaList password={value} criteria={criteria} />
                ) : (
                    emptyHint && <div className="rr-hint">{emptyHint}</div>
                )}
            </div>
            {(showConfirmWhenEmpty || value.length > 0) && (
                <div className="rr-field">
                    <label htmlFor={confirmId}>{confirmLabel}</label>
                    <input
                        id={confirmId}
                        className="rr-input"
                        type={inputType}
                        autoComplete="new-password"
                        aria-invalid={mismatch}
                        value={confirmValue}
                        onChange={(e) => onConfirmChange(e.target.value)}
                    />
                    {mismatch && <div className="rr-error-text">Passwords do not match.</div>}
                </div>
            )}
        </>
    );
}
