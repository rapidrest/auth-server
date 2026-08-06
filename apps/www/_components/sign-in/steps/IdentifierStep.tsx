import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface IdentifierStepProps {
    identifier: string;
    setIdentifier: (value: string) => void;
    discoverLoading: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function IdentifierStep({ identifier, setIdentifier, discoverLoading, onSubmit }: IdentifierStepProps) {
    return (
        <form onSubmit={onSubmit}>
            <div className="rr-card__title">Sign in</div>
            <p className="rr-card__subtitle">Enter your account ID, e-mail, or phone number.</p>
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

            <Button variant="oauth" type="button" disabled style={{ marginBottom: "0.6rem" }}>
                Continue with Google
            </Button>
            <Button variant="oauth" type="button" disabled>
                Continue with Microsoft
            </Button>
            <div className="rr-hint" style={{ textAlign: "center", marginTop: "0.6rem" }}>
                OAuth sign-in isn&rsquo;t configured on this server yet.
            </div>
        </form>
    );
}
