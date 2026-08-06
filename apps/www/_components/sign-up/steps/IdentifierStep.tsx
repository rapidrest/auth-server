import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";
import { RegistrationIdentifierType } from "../../../_lib/api.js";

export interface IdentifierStepProps {
    identifierType: RegistrationIdentifierType;
    setIdentifierType: (type: RegistrationIdentifierType) => void;
    identifier: string;
    setIdentifier: (value: string) => void;
    loading: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function IdentifierStep({
    identifierType,
    setIdentifierType,
    identifier,
    setIdentifier,
    loading,
    onSubmit,
}: IdentifierStepProps) {
    function toggleType() {
        setIdentifierType(identifierType === "email" ? "phone" : "email");
        setIdentifier("");
    }

    return (
        <form onSubmit={onSubmit}>
            <div className="rr-card__title">Create your account</div>
            <p className="rr-card__subtitle">Enter your e-mail address or phone number to get started.</p>
            <FormField label={identifierType === "email" ? "E-mail address" : "Phone number"} htmlFor="identifier">
                <input
                    id="identifier"
                    className="rr-input"
                    type={identifierType === "email" ? "email" : "tel"}
                    autoComplete={identifierType === "email" ? "email" : "tel"}
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={identifierType === "email" ? "you@example.com" : "+1 555 123 4567"}
                />
                <Button variant="text" type="button" onClick={toggleType}>
                    Use {identifierType === "email" ? "a phone number" : "an e-mail address"} instead
                </Button>
            </FormField>
            <Button type="submit" loading={loading} disabled={loading}>
                Continue
            </Button>
        </form>
    );
}
