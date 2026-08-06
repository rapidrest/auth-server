import React, { FormEvent, useState } from "react";
import {
    ApiRequestError,
    beginRegistration,
    createPasswordSecret,
    createProfile,
    createUsernameAlias,
    RegistrationIdentifierType,
    setAuthToken,
    verifyRegistration,
} from "../../_lib/api.js";
import { isPasswordValid, usePasswordRequirements } from "../../_lib/passwordCriteria.js";
import AuthShell from "../../_components/layout/AuthShell.js";
import Alert from "../../_components/feedback/Alert.js";
import StepDots from "../../_components/sign-up/progress/StepDots.js";
import IdentifierStep from "../../_components/sign-up/steps/IdentifierStep.js";
import CodeStep from "../../_components/sign-up/steps/CodeStep.js";
import ProfileStep from "../../_components/sign-up/steps/ProfileStep.js";

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
    const { criteria: passwordCriteria } = usePasswordRequirements();

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
        <AuthShell brand>
            <StepDots count={STEPS.length} activeIndex={stepIndex} />

            <div className="rr-card">
                {error && <Alert>{error}</Alert>}

                {step === "identifier" && (
                    <IdentifierStep
                        identifierType={identifierType}
                        setIdentifierType={setIdentifierType}
                        identifier={identifier}
                        setIdentifier={setIdentifier}
                        loading={loading}
                        onSubmit={handleIdentifierSubmit}
                    />
                )}

                {step === "code" && (
                    <CodeStep
                        identifierType={identifierType}
                        identifier={identifier}
                        code={code}
                        setCode={setCode}
                        loading={loading}
                        onSubmit={handleCodeSubmit}
                        onResend={handleResendCode}
                    />
                )}

                {step === "profile" && (
                    <ProfileStep
                        username={username}
                        setUsername={setUsername}
                        givenName={givenName}
                        setGivenName={setGivenName}
                        familyName={familyName}
                        setFamilyName={setFamilyName}
                        birthdate={birthdate}
                        setBirthdate={setBirthdate}
                        password={password}
                        setPassword={setPassword}
                        confirmPassword={confirmPassword}
                        setConfirmPassword={setConfirmPassword}
                        passwordCriteria={passwordCriteria}
                        loading={loading}
                        onSubmit={handleProfileSubmit}
                    />
                )}
            </div>

            <div className="rr-footer-link">
                Already have an account? <a href="/auth/signin">Sign in</a>
            </div>
        </AuthShell>
    );
}
