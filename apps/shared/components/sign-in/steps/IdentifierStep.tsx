import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";
import Alert from "../../feedback/Alert.js";

export interface IdentifierStepProps {
    identifier: string;
    setIdentifier: (value: string) => void;
    discoverLoading: boolean;
    error: string | null;
    onSubmit: (e: FormEvent) => void;
}

export default function IdentifierStep({ identifier, setIdentifier, discoverLoading, error, onSubmit }: IdentifierStepProps) {
    return (
        <form onSubmit={onSubmit}>
            <div className="rr-card__title">Sign in</div>
            <p className="rr-card__subtitle">Enter your account ID, e-mail, or phone number.</p>
            {error && <Alert>{error}</Alert>}
            <FormField label="Account ID, e-mail, or phone" htmlFor="identifier">
                <input
                    id="identifier"
                    className="rr-input"
                    type="text"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com"
                />
            </FormField>
            <Button type="submit" loading={discoverLoading} disabled={discoverLoading}>
                Continue
            </Button>

            <div className="rr-divider">or</div>

            <Button
                variant="oauth"
                type="button"
                style={{ marginBottom: "0.6rem" }}
                onClick={() => {
                    window.location.href = "/api/auth/google";
                }}
            >
                Continue with Google
            </Button>
            <Button
                variant="oauth"
                type="button"
                style={{ marginBottom: "0.6rem" }}
                onClick={() => {
                    window.location.href = "/api/auth/microsoft";
                }}
            >
                Continue with Microsoft
            </Button>
            <Button
                variant="oauth"
                type="button"
                style={{ marginBottom: "0.6rem" }}
                onClick={() => {
                    window.location.href = "/api/auth/apple";
                }}
            >
                Continue with Apple
            </Button>
            <Button
                variant="oauth"
                type="button"
                onClick={() => {
                    window.location.href = "/api/auth/facebook";
                }}
            >
                Continue with Facebook
            </Button>
        </form>
    );
}
