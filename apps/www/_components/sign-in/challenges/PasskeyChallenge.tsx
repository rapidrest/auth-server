import React from "react";
import Button from "../../buttons/Button.js";

export interface PasskeyChallengeProps {
    loading: boolean;
    onSignIn: () => void;
}

export default function PasskeyChallenge({ loading, onSignIn }: PasskeyChallengeProps) {
    return (
        <div className="rr-field">
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Your browser will prompt you to confirm with a passkey.
            </p>
            <Button type="button" onClick={onSignIn} loading={loading} disabled={loading}>
                Continue with passkey
            </Button>
        </div>
    );
}
