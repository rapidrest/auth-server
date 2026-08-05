import React, { FormEvent, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    AuthResult,
    getFido2Challenge,
    getPasskeyChallenge,
    setAuthToken,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyPasskeySignIn,
} from "../../_lib/api.js";

type Step = "identifier" | "method";
type Method = "password" | "totp" | "passkey" | "fido2";

const METHODS: { id: Method; label: string }[] = [
    { id: "password", label: "Password" },
    { id: "totp", label: "Authenticator app" },
    { id: "passkey", label: "Passkey" },
    { id: "fido2", label: "Security key" },
];

export default function SignInPage() {
    const [step, setStep] = useState<Step>("identifier");
    const [identifier, setIdentifier] = useState("");
    const [method, setMethod] = useState<Method>("password");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleIdentifierSubmit(e: FormEvent) {
        e.preventDefault();
        setStep("method");
    }

    function completeSignIn(result: AuthResult) {
        setAuthToken(result.token);
        window.location.href = "/account";
    }

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithPassword(identifier.trim(), password);
            completeSignIn(result);
        } catch (err) {
            setError(
                err instanceof ApiRequestError ? "Incorrect account ID or password." : "Something went wrong. Please try again.",
            );
            setLoading(false);
        }
    }

    async function handleTotpSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithTotp(identifier.trim(), totpCode.trim());
            completeSignIn(result);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handlePasskeySignIn() {
        setError(null);
        setLoading(true);
        try {
            const optionsJSON = (await getPasskeyChallenge(identifier.trim())) as PublicKeyCredentialRequestOptionsJSON;
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyPasskeySignIn(response);
            completeSignIn(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Passkey sign-in was cancelled.");
            } else {
                setError(err instanceof ApiRequestError ? "Passkey sign-in failed." : "Something went wrong. Please try again.");
            }
            setLoading(false);
        }
    }

    async function handleFido2SignIn() {
        setError(null);
        setLoading(true);
        try {
            const optionsJSON = (await getFido2Challenge(identifier.trim())) as PublicKeyCredentialRequestOptionsJSON;
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyFido2SignIn(response);
            completeSignIn(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Security key sign-in was cancelled.");
            } else {
                setError(
                    err instanceof ApiRequestError ? "Security key sign-in failed." : "Something went wrong. Please try again.",
                );
            }
            setLoading(false);
        }
    }

    return (
        <div className="rr-page">
            <div className="rr-container">
                <div className="rr-brand">
                    <img src="/images/logo.svg" width="128" height="128" alt="" /><br/>
                    <span>RapidREST</span>
                </div>

                <div className="rr-card">
                    {error && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {error}
                        </div>
                    )}

                    {step === "identifier" && (
                        <form onSubmit={handleIdentifierSubmit}>
                            <div className="rr-card__title">Sign in</div>
                            <p className="rr-card__subtitle">Enter your account ID, e-mail, or phone number.</p>
                            <div className="rr-field">
                                <label htmlFor="identifier">Account ID, e-mail, or phone</label>
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
                            </div>
                            <button className="rr-button rr-button--primary" type="submit">
                                Continue
                            </button>

                            <div className="rr-divider">or</div>

                            <button
                                className="rr-button rr-button--oauth"
                                type="button"
                                disabled
                                style={{ marginBottom: "0.6rem" }}
                            >
                                Continue with Google
                            </button>
                            <button className="rr-button rr-button--oauth" type="button" disabled>
                                Continue with Microsoft
                            </button>
                            <div className="rr-hint" style={{ textAlign: "center", marginTop: "0.6rem" }}>
                                OAuth sign-in isn&rsquo;t configured on this server yet.
                            </div>
                        </form>
                    )}

                    {step === "method" && (
                        <div>
                            <div className="rr-card__title">Sign in</div>
                            <p className="rr-card__subtitle">
                                Choose how you&rsquo;d like to sign in as <strong>{identifier}</strong>.
                            </p>

                            <div className="rr-method-tabs" role="tablist">
                                {METHODS.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={method === m.id}
                                        className={"rr-method-tab" + (method === m.id ? " rr-method-tab--active" : "")}
                                        onClick={() => {
                                            setMethod(m.id);
                                            setError(null);
                                        }}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            {method === "password" && (
                                <form onSubmit={handlePasswordSubmit}>
                                    <div className="rr-field">
                                        <label htmlFor="password">Password</label>
                                        <input
                                            id="password"
                                            className="rr-input"
                                            type="password"
                                            autoComplete="current-password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>
                                    <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                        {loading && <span className="rr-spinner" />}
                                        Sign in
                                    </button>
                                </form>
                            )}

                            {method === "totp" && (
                                <form onSubmit={handleTotpSubmit}>
                                    <div className="rr-field">
                                        <label htmlFor="totpCode">Authenticator code</label>
                                        <input
                                            id="totpCode"
                                            className="rr-code-input"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            required
                                            value={totpCode}
                                            onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ""))}
                                            placeholder="······"
                                        />
                                    </div>
                                    <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                        {loading && <span className="rr-spinner" />}
                                        Sign in
                                    </button>
                                </form>
                            )}

                            {method === "passkey" && (
                                <div className="rr-field">
                                    <p className="rr-hint" style={{ marginTop: 0 }}>
                                        Your browser will prompt you to confirm with a passkey.
                                    </p>
                                    <button
                                        className="rr-button rr-button--primary"
                                        type="button"
                                        onClick={handlePasskeySignIn}
                                        disabled={loading}
                                    >
                                        {loading && <span className="rr-spinner" />}
                                        Continue with passkey
                                    </button>
                                </div>
                            )}

                            {method === "fido2" && (
                                <div className="rr-field">
                                    <p className="rr-hint" style={{ marginTop: 0 }}>
                                        Insert your security key and follow your browser&rsquo;s prompt.
                                    </p>
                                    <button
                                        className="rr-button rr-button--primary"
                                        type="button"
                                        onClick={handleFido2SignIn}
                                        disabled={loading}
                                    >
                                        {loading && <span className="rr-spinner" />}
                                        Continue with security key
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                className="rr-button--text"
                                onClick={() => {
                                    setStep("identifier");
                                    setError(null);
                                    setPassword("");
                                    setTotpCode("");
                                }}
                            >
                                Use a different account
                            </button>
                        </div>
                    )}
                </div>

                <div className="rr-footer-link">
                    Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
                </div>
            </div>
        </div>
    );
}
