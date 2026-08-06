import React from "react";
import { isPasswordValid, PasswordCriteriaList, type PasswordCriterion } from "../../lib/passwordCriteria.js";

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
}: PasswordFieldsetProps) {
    const mismatch = confirmValue.length > 0 && confirmValue !== value;
    return (
        <>
            <div className="rr-field">
                <label htmlFor={id}>{label}</label>
                <input
                    id={id}
                    className="rr-input"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={value.length > 0 && !isPasswordValid(value, criteria)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
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
                        type="password"
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
