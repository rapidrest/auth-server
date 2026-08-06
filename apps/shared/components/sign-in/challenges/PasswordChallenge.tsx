import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface PasswordChallengeProps {
    password: string;
    setPassword: (value: string) => void;
    loading: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function PasswordChallenge({ password, setPassword, loading, onSubmit }: PasswordChallengeProps) {
    return (
        <form onSubmit={onSubmit}>
            <FormField label="Password" htmlFor="password">
                <input
                    id="password"
                    className="rr-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </FormField>
            <Button type="submit" loading={loading} disabled={loading}>
                Sign in
            </Button>
        </form>
    );
}
