import React from "react";
import Button from "../../buttons/Button.js";

export interface Fido2ChallengeProps {
    loading: boolean;
    onSignIn: () => void;
}

export default function Fido2Challenge({ loading, onSignIn }: Fido2ChallengeProps) {
    return (
        <div className="rr-field">
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Insert your security key and follow your browser&rsquo;s prompt.
            </p>
            <Button type="button" onClick={onSignIn} loading={loading} disabled={loading}>
                Continue with security key
            </Button>
        </div>
    );
}
