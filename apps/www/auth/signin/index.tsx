import React, { FormEvent, useState } from "react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    AuthResult,
    DiscoverResult,
    discoverAuthMethods,
    getFido2Challenge,
    getOtpChallenge,
    getPasskeyChallenge,
    setAuthToken,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyPasskeySignIn,
} from "../../_lib/api.js";
import Modal from "../../_lib/Modal.js";

type Method = "passkey" | "password" | "totp" | "otp" | "fido2";

// Passkey listed first (and so selected by default when available) to mirror how other providers
// auto-prioritize a configured passkey as the recommended sign-in method.
const METHOD_LABELS: Record<Method, string> = {
    passkey: "Passkey",
    password: "Password",
    totp: "Authenticator app",
    otp: "One-time code",
    fido2: "Security key",
};

const EMPTY_DISCOVER: DiscoverResult = { password: false, totp: false, passkey: false, fido2: false, otp: [] };

function availableMethods(discover: DiscoverResult): Method[] {
    const methods: Method[] = [];
    if (discover.passkey) methods.push("passkey");
    if (discover.password) methods.push("password");
    if (discover.totp) methods.push("totp");
    if (discover.otp.length > 0) methods.push("otp");
    if (discover.fido2) methods.push("fido2");
    return methods;
}

// Only ever called with a non-empty list — "otp" is only an available tab when discover.otp is non-empty
// (see availableMethods()).
function formatOtpHint(hints: DiscoverResult["otp"]): string {
    const contacts = hints.map((h) => h.contact);
    if (contacts.length === 1) return `We can send a code to ${contacts[0]}.`;
    return `We can send a code to ${contacts.slice(0, -1).join(", ")} or ${contacts[contacts.length - 1]}.`;
}

export default function SignInPage() {
    const [identifier, setIdentifier] = useState("");
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const [discover, setDiscover] = useState<DiscoverResult>(EMPTY_DISCOVER);
    const [modalOpen, setModalOpen] = useState(false);
    const [method, setMethod] = useState<Method>("password");

    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [otpStep, setOtpStep] = useState<"contact" | "code">("contact");
    const [otpContact, setOtpContact] = useState("");
    const [otpCode, setOtpCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const methods = availableMethods(discover);

    async function handleIdentifierSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setDiscoverLoading(true);
        let result: DiscoverResult;
        try {
            result = await discoverAuthMethods(identifier.trim());
        } catch {
            result = EMPTY_DISCOVER;
        }
        setDiscover(result);
        const available = availableMethods(result);
        if (available.length > 0) {
            setMethod(available[0]);
        }
        setDiscoverLoading(false);
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);
        setError(null);
        setPassword("");
        setTotpCode("");
        setOtpStep("contact");
        setOtpContact("");
        setOtpCode("");
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

    async function handleOtpChallengeSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await getOtpChallenge(otpContact.trim());
            setOtpStep("code");
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleOtpVerifySubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithOtp(otpContact.trim(), otpCode.trim());
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
                        <button className="rr-button rr-button--primary" type="submit" disabled={discoverLoading}>
                            {discoverLoading && <span className="rr-spinner" />}
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
                </div>

                <div className="rr-footer-link">
                    Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
                </div>
            </div>

            <Modal open={modalOpen} onClose={closeModal} title="Sign in">
                {error && (
                    <div className="rr-alert rr-alert--error" role="alert">
                        {error}
                    </div>
                )}

                {methods.length === 0 && (
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        No sign-in methods are available for that account ID. Double-check it and try again.
                    </p>
                )}

                {methods.length > 0 && (
                    <div>
                        <p className="rr-card__subtitle">
                            Choose how you&rsquo;d like to sign in as <strong>{identifier}</strong>.
                        </p>

                        <div className="rr-method-tabs" role="tablist">
                            {methods.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    role="tab"
                                    aria-selected={method === m}
                                    className={"rr-method-tab" + (method === m ? " rr-method-tab--active" : "")}
                                    onClick={() => {
                                        setMethod(m);
                                        setError(null);
                                    }}
                                >
                                    {METHOD_LABELS[m]}
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

                        {method === "otp" && otpStep === "contact" && (
                            <form onSubmit={handleOtpChallengeSubmit}>
                                {/* `otp` is only ever an available tab when discover.otp is non-empty (see
                                    availableMethods()), so a hint is always present here. */}
                                <p className="rr-hint" style={{ marginTop: 0 }}>
                                    {formatOtpHint(discover.otp)} Enter it below to receive a one-time code.
                                </p>
                                <div className="rr-field">
                                    <label htmlFor="otpContact">E-mail or phone</label>
                                    <input
                                        id="otpContact"
                                        className="rr-input"
                                        type="text"
                                        required
                                        value={otpContact}
                                        onChange={(e) => setOtpContact(e.target.value)}
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                    {loading && <span className="rr-spinner" />}
                                    Send code
                                </button>
                            </form>
                        )}

                        {method === "otp" && otpStep === "code" && (
                            <form onSubmit={handleOtpVerifySubmit}>
                                <p className="rr-hint" style={{ marginTop: 0 }}>
                                    We sent a code to {otpContact}.
                                </p>
                                <div className="rr-field">
                                    <label htmlFor="otpCode">One-time code</label>
                                    <input
                                        id="otpCode"
                                        className="rr-code-input"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        required
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                                        placeholder="······"
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                        {loading && <span className="rr-spinner" />}
                                        Sign in
                                    </button>
                                    <button
                                        className="rr-button rr-button--secondary"
                                        type="button"
                                        onClick={() => {
                                            setOtpStep("contact");
                                            setOtpCode("");
                                            setError(null);
                                        }}
                                    >
                                        Use a different contact
                                    </button>
                                </div>
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
                    </div>
                )}
            </Modal>
        </div>
    );
}
