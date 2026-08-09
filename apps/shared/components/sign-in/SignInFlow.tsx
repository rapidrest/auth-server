import React, { FormEvent, useState } from "react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    AuthResult,
    beginMfaChallenge,
    DiscoverResult,
    discoverAuthMethods,
    getFido2Challenge,
    getOtpChallenge,
    getPasskeyChallenge,
    isMfaChallenge,
    MfaChallenge,
    MfaMethod,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyMfaCode,
    verifyMfaFido2,
    verifyPasskeySignIn,
} from "../../lib/api.js";
import { guessIdentifierType } from "../../lib/identifier.js";
import IdentifierStep from "./steps/IdentifierStep.js";
import MethodListStep from "./steps/MethodListStep.js";
import ChallengeStep from "./steps/ChallengeStep.js";
import MfaStep from "./steps/MfaStep.js";
import { buildMethodList, EMPTY_DISCOVER, FixedMethod, Method, OtpHint, Step } from "./types.js";

export interface SignInFlowProps {
    /**
     * Called once sign-in completes successfully. The page renders this as "store the token and
     * navigate to /account"; a future pop-up usage would do something else instead (e.g. close itself)
     * — that's the whole reason this component doesn't do either of those things itself.
     */
    onSuccess: (result: AuthResult) => void;
}

/**
 * The sign-in step machine (identifier → methods → challenge). Renders only its `.rr-card` content —
 * no page chrome — so it can be dropped into a `Modal` for a pop-up sign-in with no changes.
 */
export default function SignInFlow({ onSuccess }: SignInFlowProps) {
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

    // Populated when signInWithPassword() resolves an MfaChallenge instead of a completed AuthResult —
    // see handlePasswordSubmit.
    const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
    const [mfaSelectedMethod, setMfaSelectedMethod] = useState<MfaMethod | null>(null);
    const [mfaFido2Options, setMfaFido2Options] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
    const [mfaCode, setMfaCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const methodItems = buildMethodList(discover);

    async function handleIdentifierSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setDiscoverLoading(true);
        const trimmedIdentifier = identifier.trim();
        let result: DiscoverResult;
        try {
            result = await discoverAuthMethods(trimmedIdentifier);
        } catch (err) {
            setDiscoverLoading(false);
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
            return;
        }
        const items = buildMethodList(result);
        if (items.length === 0) {
            // No account recognizes this identifier — send the user to sign-up instead of a dead end. An
            // e-mail/phone-shaped identifier can skip straight to sign-up's verification step (they already
            // typed the contact value); anything else (e.g. a username attempt) can only start sign-up fresh.
            const guessedType = guessIdentifierType(trimmedIdentifier);
            window.location.href = guessedType
                ? `/auth/signup?${new URLSearchParams({ type: guessedType, id: trimmedIdentifier, autosend: "1" }).toString()}`
                : "/auth/signup";
            return;
        }
        setDiscover(result);
        setDiscoverLoading(false);
        if (items.length === 1) {
            // Nothing to choose between — skip the method-list step and go straight to the one method's
            // challenge. `onBack` from there returns to the identifier step instead of a one-item list.
            const only = items[0];
            if (only.kind === "fixed") {
                selectFixedMethod(only.method);
            } else {
                selectOtpMethod(only.hint);
            }
            return;
        }
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
        setMfaChallenge(null);
        setMfaSelectedMethod(null);
        setMfaFido2Options(null);
        setMfaCode("");
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

    function backToMfaMethods() {
        setError(null);
        setMfaSelectedMethod(null);
        setMfaFido2Options(null);
        setMfaCode("");
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

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithPassword(identifier.trim(), password);
            if (isMfaChallenge(result)) {
                setMfaChallenge(result);
                setStep("mfa");
                setLoading(false);
            } else {
                onSuccess(result);
            }
        } catch (err) {
            setError(
                err instanceof ApiRequestError ? "Incorrect account ID or password." : "Something went wrong. Please try again.",
            );
            setLoading(false);
        }
    }

    async function handleSelectMfaMethod(selected: MfaMethod) {
        // Only reachable via MfaStep's onSelectMethod, which only renders once mfaChallenge is set.
        const { uid } = mfaChallenge!;
        setError(null);
        setLoading(true);
        try {
            const challengeResult = await beginMfaChallenge(uid, selected.id);
            setMfaSelectedMethod(selected);
            if (selected.type === "fido2") {
                setMfaFido2Options(challengeResult);
            }
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleMfaCodeSubmit(e: FormEvent) {
        e.preventDefault();
        // Only reachable via MfaStep's onCodeSubmit, which only renders once mfaChallenge is set.
        const { uid } = mfaChallenge!;
        setError(null);
        setLoading(true);
        try {
            const result = await verifyMfaCode(uid, mfaCode.trim());
            onSuccess(result);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handleMfaFido2SignIn() {
        // Only reachable via MfaStep's onFido2SignIn, which only renders once mfaFido2Options is set
        // (handleSelectMfaMethod sets it before the fido2 challenge UI ever appears).
        const optionsJSON = mfaFido2Options!;
        setError(null);
        setLoading(true);
        try {
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyMfaFido2(response);
            onSuccess(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Hardware key sign-in was cancelled.");
            } else {
                setError(
                    err instanceof ApiRequestError ? "Hardware key sign-in failed." : "Something went wrong. Please try again.",
                );
            }
            setLoading(false);
        }
    }

    async function handleTotpSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithTotp(identifier.trim(), totpCode.trim());
            onSuccess(result);
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
            onSuccess(result);
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
            onSuccess(result);
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
            onSuccess(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Hardware key sign-in was cancelled.");
            } else {
                setError(
                    err instanceof ApiRequestError ? "Hardware key sign-in failed." : "Something went wrong. Please try again.",
                );
            }
            setLoading(false);
        }
    }

    return (
        <div className="rr-card">
            {step === "identifier" && (
                <IdentifierStep
                    identifier={identifier}
                    setIdentifier={setIdentifier}
                    discoverLoading={discoverLoading}
                    error={error}
                    onSubmit={handleIdentifierSubmit}
                />
            )}

            {step === "methods" && (
                <MethodListStep
                    identifier={identifier}
                    methodItems={methodItems}
                    onSelectFixed={selectFixedMethod}
                    onSelectOtp={selectOtpMethod}
                    onBack={goToIdentifier}
                />
            )}

            {step === "challenge" && method && (
                <ChallengeStep
                    method={method}
                    identifier={identifier}
                    selectedOtpHint={selectedOtpHint}
                    error={error}
                    loading={loading}
                    onBack={methodItems.length === 1 ? goToIdentifier : goToMethods}
                    backLabel={methodItems.length === 1 ? "Use a different account" : undefined}
                    password={password}
                    setPassword={setPassword}
                    onPasswordSubmit={handlePasswordSubmit}
                    totpCode={totpCode}
                    setTotpCode={setTotpCode}
                    onTotpSubmit={handleTotpSubmit}
                    otpStep={otpStep}
                    otpContact={otpContact}
                    setOtpContact={setOtpContact}
                    otpCode={otpCode}
                    setOtpCode={setOtpCode}
                    onOtpContactSubmit={handleOtpChallengeSubmit}
                    onOtpVerifySubmit={handleOtpVerifySubmit}
                    onOtpBackToContact={() => {
                        setOtpStep("contact");
                        setOtpCode("");
                        setError(null);
                    }}
                    onPasskeySignIn={handlePasskeySignIn}
                    onFido2SignIn={handleFido2SignIn}
                />
            )}

            {step === "mfa" && mfaChallenge && (
                <MfaStep
                    methods={mfaChallenge.methods}
                    selectedMethod={mfaSelectedMethod}
                    onSelectMethod={handleSelectMfaMethod}
                    onBackToMethods={backToMfaMethods}
                    onBack={goToIdentifier}
                    code={mfaCode}
                    setCode={setMfaCode}
                    onCodeSubmit={handleMfaCodeSubmit}
                    onFido2SignIn={handleMfaFido2SignIn}
                    loading={loading}
                    error={error}
                />
            )}
        </div>
    );
}
