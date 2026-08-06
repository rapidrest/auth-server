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

type Step = "identifier" | "methods" | "challenge";
type FixedMethod = "passkey" | "password" | "totp" | "fido2";
type Method = FixedMethod | "otp";
type OtpHint = DiscoverResult["otp"][number];

type MethodListItem = { kind: "fixed"; method: FixedMethod } | { kind: "otp"; hint: OtpHint };

// Passkey listed first to mirror how other providers surface a configured passkey as the recommended option.
const FIXED_METHOD_LABELS: Record<FixedMethod, string> = {
    passkey: "Passkey",
    password: "Password",
    totp: "Authenticator app",
    fido2: "Security key",
};

const CONTACT_TYPE_LABELS: Record<OtpHint["type"], string> = {
    email: "Email",
    phone: "Phone",
};

const EMPTY_DISCOVER: DiscoverResult = { password: false, totp: false, passkey: false, fido2: false, otp: [] };

// One list item per discovered OTP-eligible contact — each is its own selectable sign-in method, not a
// single combined "One-time code" entry, so the user can tell which contact a code would go to before picking it.
function buildMethodList(discover: DiscoverResult): MethodListItem[] {
    const items: MethodListItem[] = [];
    if (discover.passkey) items.push({ kind: "fixed", method: "passkey" });
    if (discover.password) items.push({ kind: "fixed", method: "password" });
    if (discover.totp) items.push({ kind: "fixed", method: "totp" });
    for (const hint of discover.otp) {
        items.push({ kind: "otp", hint });
    }
    if (discover.fido2) items.push({ kind: "fixed", method: "fido2" });
    return items;
}

export default function SignInPage() {
    const [step, setStep] = useState<Step>("identifier");
    const [identifier, setIdentifier] = useState("");
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const [discover, setDiscover] = useState<DiscoverResult>(EMPTY_DISCOVER);
    const [method, setMethod] = useState<Method | null>(null);
    const [selectedOtpHint, setSelectedOtpHint] = useState<OtpHint | null>(null);

    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [otpStep, setOtpStep] = useState<"contact" | "code">("contact");
    const [otpContact, setOtpContact] = useState("");
    const [otpCode, setOtpCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const methodItems = buildMethodList(discover);

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
        setDiscoverLoading(false);
        setStep("methods");
    }

    function goToIdentifier() {
        setStep("identifier");
        setError(null);
        setMethod(null);
        setSelectedOtpHint(null);
        setPassword("");
        setTotpCode("");
        setOtpStep("contact");
        setOtpContact("");
        setOtpCode("");
    }

    function goToMethods() {
        setStep("methods");
        setError(null);
        setMethod(null);
        setSelectedOtpHint(null);
        setPassword("");
        setTotpCode("");
        setOtpStep("contact");
        setOtpContact("");
        setOtpCode("");
    }

    function selectFixedMethod(m: FixedMethod) {
        setMethod(m);
        setSelectedOtpHint(null);
        setError(null);
        setStep("challenge");
    }

    function selectOtpMethod(hint: OtpHint) {
        setMethod("otp");
        setSelectedOtpHint(hint);
        setError(null);
        setStep("challenge");
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
                    )}

                    {step === "methods" && (
                        <div>
                            <div className="rr-card__title">Sign in</div>
                            <p className="rr-card__subtitle">
                                Choose how you&rsquo;d like to sign in as <strong>{identifier}</strong>.
                            </p>

                            {methodItems.length === 0 && (
                                <p className="rr-hint" style={{ marginTop: 0 }}>
                                    No sign-in methods are available for that account ID. Double-check it and try again.
                                </p>
                            )}

                            {methodItems.length > 0 && (
                                <div className="rr-method-list">
                                    {methodItems.map((item) =>
                                        item.kind === "fixed" ? (
                                            <button
                                                key={item.method}
                                                type="button"
                                                className="rr-method-list-item"
                                                onClick={() => selectFixedMethod(item.method)}
                                            >
                                                {FIXED_METHOD_LABELS[item.method]}
                                                <span aria-hidden="true">&rsaquo;</span>
                                            </button>
                                        ) : (
                                            <button
                                                key={`otp-${item.hint.type}-${item.hint.contact}`}
                                                type="button"
                                                className="rr-method-list-item"
                                                onClick={() => selectOtpMethod(item.hint)}
                                            >
                                                {CONTACT_TYPE_LABELS[item.hint.type]}: {item.hint.contact}
                                                <span aria-hidden="true">&rsaquo;</span>
                                            </button>
                                        ),
                                    )}
                                </div>
                            )}

                            <button
                                type="button"
                                className="rr-button--text"
                                style={{ marginTop: "1rem" }}
                                onClick={goToIdentifier}
                            >
                                Use a different account
                            </button>
                        </div>
                    )}

                    {step === "challenge" && method && (
                        <div>
                            <div className="rr-card__title">
                                {method === "otp" ? CONTACT_TYPE_LABELS[selectedOtpHint!.type] : FIXED_METHOD_LABELS[method]}
                            </div>
                            <p className="rr-card__subtitle">
                                Signing in as <strong>{identifier}</strong>.
                            </p>

                            {error && (
                                <div className="rr-alert rr-alert--error" role="alert">
                                    {error}
                                </div>
                            )}

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
                                    <p className="rr-hint" style={{ marginTop: 0 }}>
                                        We can send a code to {selectedOtpHint!.contact}. Enter it below to receive a
                                        one-time code.
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

                            <button
                                type="button"
                                className="rr-button--text"
                                style={{ marginTop: "0.5rem" }}
                                onClick={goToMethods}
                            >
                                Choose a different method
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
