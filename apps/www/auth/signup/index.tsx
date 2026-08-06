import React, { FormEvent, useEffect, useMemo, useState } from "react";
import {
    ApiRequestError,
    beginRegistration,
    createPasswordSecret,
    createProfile,
    createUsernameAlias,
    getPasswordRequirements,
    PasswordRequirements,
    RegistrationIdentifierType,
    setAuthToken,
    verifyRegistration,
} from "../../_lib/api.js";
import {
    buildPasswordCriteria,
    FALLBACK_PASSWORD_REQUIREMENTS,
    isPasswordValid,
    PasswordCriteriaList,
} from "../../_lib/passwordCriteria.js";

type Step = "identifier" | "code" | "profile";

const STEPS: Step[] = ["identifier", "code", "profile"];

export default function SignUpPage() {
    const [step, setStep] = useState<Step>("identifier");
    const [identifierType, setIdentifierType] = useState<RegistrationIdentifierType>("email");
    const [identifier, setIdentifier] = useState("");
    const [code, setCode] = useState("");
    const [username, setUsername] = useState("");
    const [givenName, setGivenName] = useState("");
    const [familyName, setFamilyName] = useState("");
    const [birthdate, setBirthdate] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordRequirements, setPasswordRequirements] = useState<PasswordRequirements>(
        FALLBACK_PASSWORD_REQUIREMENTS,
    );

    useEffect(() => {
        getPasswordRequirements()
            .then(setPasswordRequirements)
            .catch(() => {
                // Keep the fallback defaults — the server is still the source of truth at submit time.
            });
    }, []);

    const passwordCriteria = useMemo(() => buildPasswordCriteria(passwordRequirements), [passwordRequirements]);

    const stepIndex = STEPS.indexOf(step);

    async function handleIdentifierSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await beginRegistration(identifierType, identifier.trim());
            setStep("code");
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleResendCode() {
        setError(null);
        setLoading(true);
        try {
            await beginRegistration(identifierType, identifier.trim());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleCodeSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            // Verifying the code creates the account (User + verified Alias) and logs it in immediately —
            // the profile/password steps that follow are separate authenticated calls, not part of this one.
            const result = await verifyRegistration(identifierType, identifier.trim(), code.trim());
            setAuthToken(result.token);
            setStep("profile");
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleProfileSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (password && !isPasswordValid(password, passwordCriteria)) {
            setError("Password does not meet the requirements below.");
            return;
        }
        if (password && password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await createProfile({
                givenName: givenName.trim() || undefined,
                familyName: familyName.trim() || undefined,
                birthdate: birthdate || undefined,
                contacts: [{ contact: identifier.trim(), type: identifierType, verified: true }],
            });
            if (username.trim()) {
                await createUsernameAlias(username.trim());
            }
            if (password) {
                await createPasswordSecret(password);
            }
            window.location.href = "/account";
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    return (
        <div className="rr-page">
            <div className="rr-container">
                <div className="rr-brand">
                    <img src="/images/logo.svg" width="128" height="128" alt="logo" /><br/>
                    <span>RapidREST</span>
                </div>

                <div className="rr-steps" aria-hidden="true">
                    {STEPS.map((s, i) => (
                        <span
                            key={s}
                            className={
                                "rr-step-dot" +
                                (i === stepIndex ? " rr-step-dot--active" : i < stepIndex ? " rr-step-dot--done" : "")
                            }
                        />
                    ))}
                </div>

                <div className="rr-card">
                    {error && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {error}
                        </div>
                    )}

                    {step === "identifier" && (
                        <form onSubmit={handleIdentifierSubmit}>
                            <div className="rr-card__title">Create your account</div>
                            <p className="rr-card__subtitle">Enter your e-mail address or phone number to get started.</p>
                            <div className="rr-field">
                                <label htmlFor="identifier">
                                    {identifierType === "email" ? "E-mail address" : "Phone number"}
                                </label>
                                <input
                                    id="identifier"
                                    className="rr-input"
                                    type={identifierType === "email" ? "email" : "tel"}
                                    autoComplete={identifierType === "email" ? "email" : "tel"}
                                    required
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder={identifierType === "email" ? "you@example.com" : "+1 555 123 4567"}
                                />
                                <button
                                    type="button"
                                    className="rr-button--text"
                                    onClick={() => {
                                        setIdentifierType(identifierType === "email" ? "phone" : "email");
                                        setIdentifier("");
                                    }}
                                >
                                    Use {identifierType === "email" ? "a phone number" : "an e-mail address"} instead
                                </button>
                            </div>
                            <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                {loading && <span className="rr-spinner" />}
                                Continue
                            </button>
                        </form>
                    )}

                    {step === "code" && (
                        <form onSubmit={handleCodeSubmit}>
                            <div className="rr-card__title">Check your {identifierType === "email" ? "inbox" : "messages"}</div>
                            <p className="rr-card__subtitle">
                                We sent a 6-digit verification code to <strong>{identifier}</strong>.
                            </p>
                            <div className="rr-field">
                                <label htmlFor="code">Verification code</label>
                                <input
                                    id="code"
                                    className="rr-code-input"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    required
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                                    placeholder="······"
                                />
                            </div>
                            <button className="rr-button rr-button--primary" type="submit" disabled={loading}>
                                {loading && <span className="rr-spinner" />}
                                Verify
                            </button>
                            <div className="rr-footer-link">
                                Didn&rsquo;t get a code?{" "}
                                <button type="button" className="rr-button--text" onClick={handleResendCode} disabled={loading}>
                                    Resend
                                </button>
                            </div>
                        </form>
                    )}

                    {step === "profile" && (
                        <form onSubmit={handleProfileSubmit}>
                            <div className="rr-card__title">Tell us about yourself</div>
                            <p className="rr-card__subtitle">A password is optional — you can add one, a passkey, or an authenticator app later.</p>
                            <div className="rr-field">
                                <label htmlFor="username">Username (optional)</label>
                                <input
                                    id="username"
                                    className="rr-input"
                                    type="text"
                                    autoComplete="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="A unique name you can sign in with"
                                />
                            </div>
                            <div className="rr-field">
                                <label htmlFor="givenName">Given name</label>
                                <input
                                    id="givenName"
                                    className="rr-input"
                                    type="text"
                                    autoComplete="given-name"
                                    value={givenName}
                                    onChange={(e) => setGivenName(e.target.value)}
                                />
                            </div>
                            <div className="rr-field">
                                <label htmlFor="familyName">Family name</label>
                                <input
                                    id="familyName"
                                    className="rr-input"
                                    type="text"
                                    autoComplete="family-name"
                                    value={familyName}
                                    onChange={(e) => setFamilyName(e.target.value)}
                                />
                            </div>
                            <div className="rr-field">
                                <label htmlFor="birthdate">Birthdate</label>
                                <input
                                    id="birthdate"
                                    className="rr-input"
                                    type="date"
                                    autoComplete="bday"
                                    value={birthdate}
                                    onChange={(e) => setBirthdate(e.target.value)}
                                />
                            </div>
                            <div className="rr-field">
                                <label htmlFor="password">Password (optional)</label>
                                <input
                                    id="password"
                                    className="rr-input"
                                    type="password"
                                    autoComplete="new-password"
                                    aria-invalid={password.length > 0 && !isPasswordValid(password, passwordCriteria)}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                {password.length > 0 ? (
                                    <PasswordCriteriaList password={password} criteria={passwordCriteria} />
                                ) : (
                                    <div className="rr-hint">Leave blank to add a password later, or start typing to set one now.</div>
                                )}
                            </div>
                            {password && (
                                <div className="rr-field">
                                    <label htmlFor="confirmPassword">Confirm password</label>
                                    <input
                                        id="confirmPassword"
                                        className="rr-input"
                                        type="password"
                                        autoComplete="new-password"
                                        aria-invalid={confirmPassword.length > 0 && confirmPassword !== password}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                    {confirmPassword.length > 0 && confirmPassword !== password && (
                                        <div className="rr-error-text">Passwords do not match.</div>
                                    )}
                                </div>
                            )}
                            <button
                                className="rr-button rr-button--primary"
                                type="submit"
                                disabled={
                                    loading ||
                                    (password.length > 0 && !isPasswordValid(password, passwordCriteria)) ||
                                    (password.length > 0 && password !== confirmPassword)
                                }
                            >
                                {loading && <span className="rr-spinner" />}
                                Create account
                            </button>
                        </form>
                    )}
                </div>

                <div className="rr-footer-link">
                    Already have an account? <a href="/auth/signin">Sign in</a>
                </div>
            </div>
        </div>
    );
}
