import React, { KeyboardEvent, useState } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface RoleScopeEditorProps {
    id: string;
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
}

/** A generic removable-chip list editor for a `string[]` field — used for both a User's `roles` and `scopes`. */
export default function RoleScopeEditor({ id, label, values, onChange, placeholder, disabled }: RoleScopeEditorProps) {
    const [draft, setDraft] = useState("");

    function addValue() {
        const trimmed = draft.trim();
        if (trimmed && !values.includes(trimmed)) {
            onChange([...values, trimmed]);
        }
        setDraft("");
    }

    function removeValue(value: string) {
        onChange(values.filter((v) => v !== value));
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addValue();
        }
    }

    return (
        <FormField label={label} htmlFor={id}>
            {values.length > 0 && (
                <div className="rr-chips">
                    {values.map((value) => (
                        <span className="rr-chip" key={value}>
                            {value}
                            {!disabled && (
                                <button
                                    type="button"
                                    className="rr-chip__remove"
                                    aria-label={`Remove ${value}`}
                                    onClick={() => removeValue(value)}
                                >
                                    &times;
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}
            {!disabled && (
                <div className="rr-chip-input">
                    <input
                        id={id}
                        className="rr-input"
                        type="text"
                        value={draft}
                        placeholder={placeholder}
                        disabled={disabled}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={addValue}>
                        Add
                    </Button>
                </div>
            )}
        </FormField>
    );
}
