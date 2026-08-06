import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import CodeInput from "../../forms/CodeInput.js";
import Button from "../../buttons/Button.js";
import { RegistrationIdentifierType } from "../../../lib/api.js";

export interface CodeStepProps {
    identifierType: RegistrationIdentifierType;
    identifier: string;
    code: string;
    setCode: (value: string) => void;
    loading: boolean;
    onSubmit: (e: FormEvent) => void;
    onResend: () => void;
}

export default function CodeStep({ identifierType, identifier, code, setCode, loading, onSubmit, onResend }: CodeStepProps) {
    return (
        <form onSubmit={onSubmit}>
            <div className="rr-card__title">Check your {identifierType === "email" ? "inbox" : "messages"}</div>
            <p className="rr-card__subtitle">
                We sent a 6-digit verification code to <strong>{identifier}</strong>.
            </p>
            <FormField label="Verification code" htmlFor="code">
                <CodeInput id="code" value={code} onChange={setCode} />
            </FormField>
            <Button type="submit" loading={loading} disabled={loading}>
                Verify
            </Button>
            <div className="rr-footer-link">
                Didn&rsquo;t get a code?{" "}
                <Button variant="text" type="button" onClick={onResend} disabled={loading}>
                    Resend
                </Button>
            </div>
        </form>
    );
}
