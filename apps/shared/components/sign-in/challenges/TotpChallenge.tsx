import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import CodeInput from "../../forms/CodeInput.js";
import Button from "../../buttons/Button.js";

export interface TotpChallengeProps {
    totpCode: string;
    setTotpCode: (value: string) => void;
    loading: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function TotpChallenge({ totpCode, setTotpCode, loading, onSubmit }: TotpChallengeProps) {
    return (
        <form onSubmit={onSubmit}>
            <FormField label="Authenticator code" htmlFor="totpCode">
                <CodeInput id="totpCode" value={totpCode} onChange={setTotpCode} />
            </FormField>
            <Button type="submit" loading={loading} disabled={loading}>
                Sign in
            </Button>
        </form>
    );
}
