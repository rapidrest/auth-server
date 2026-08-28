///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, ReactNode } from "react";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";
import Alert from "../../feedback/Alert.js";
import { AppleIcon, FacebookIcon, GoogleIcon, MicrosoftIcon } from "./OAuthIcons.js";

export interface IdentifierStepProps {
    identifier: string;
    setIdentifier: (value: string) => void;
    discoverLoading: boolean;
    error: string | null;
    onSubmit: (e: FormEvent) => void;
    onOAuthSignIn: (provider: string) => void;
    /** The provider id currently fetching its authorization URL, if any — shows a spinner on that
     * one button and disables the rest so a second click can't fire while the first is in flight. */
    oauthLoadingProvider: string | null;
}

const OAUTH_PROVIDERS: Array<{ id: string; label: string; icon: ReactNode }> = [
    { id: "google", label: "Continue with Google", icon: <GoogleIcon /> },
    { id: "microsoft", label: "Continue with Microsoft", icon: <MicrosoftIcon /> },
    { id: "apple", label: "Continue with Apple", icon: <AppleIcon /> },
    { id: "facebook", label: "Continue with Facebook", icon: <FacebookIcon /> },
];

export default function IdentifierStep({
    identifier,
    setIdentifier,
    discoverLoading,
    error,
    onSubmit,
    onOAuthSignIn,
    oauthLoadingProvider,
}: IdentifierStepProps) {
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

            {OAUTH_PROVIDERS.map(({ id, label, icon }, index) => (
                <Button
                    key={id}
                    variant="oauth"
                    type="button"
                    style={index < OAUTH_PROVIDERS.length - 1 ? { marginBottom: "0.6rem" } : undefined}
                    onClick={() => onOAuthSignIn(id)}
                    loading={oauthLoadingProvider === id}
                    disabled={oauthLoadingProvider !== null}
                >
                    {icon}
                    {label}
                </Button>
            ))}
        </form>
    );
}
