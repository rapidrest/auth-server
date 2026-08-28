///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface OAuthCallbackStepProps {
    error: string | null;
    onBack: () => void;
}

/**
 * Rendered while `SignInFlow` is forwarding a returning OAuth provider's `code`/`state` (or `error`)
 * to the backend to complete the sign-in — see `SignInFlow`'s mount-time effect. On success the flow
 * never actually shows this step's error state (`onSuccess` navigates away first); it only appears
 * here if the exchange itself failed.
 */
export default function OAuthCallbackStep({ error, onBack }: OAuthCallbackStepProps) {
    return (
        <div>
            <div className="rr-card__title">Signing you in&hellip;</div>
            {error ? (
                <>
                    <Alert>{error}</Alert>
                    <Button type="button" onClick={onBack}>
                        Back to sign in
                    </Button>
                </>
            ) : (
                <p className="rr-card__subtitle">Please wait while we finish signing you in.</p>
            )}
        </div>
    );
}
