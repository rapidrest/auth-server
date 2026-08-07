import React, { FormEvent } from "react";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import PasswordChallenge from "../challenges/PasswordChallenge.js";
import TotpChallenge from "../challenges/TotpChallenge.js";
import OtpChallenge from "../challenges/OtpChallenge.js";
import PasskeyChallenge from "../challenges/PasskeyChallenge.js";
import Fido2Challenge from "../challenges/Fido2Challenge.js";
import { CONTACT_TYPE_LABELS, FIXED_METHOD_LABELS, Method, OtpHint } from "../types.js";

export interface ChallengeStepProps {
    method: Method;
    identifier: string;
    selectedOtpHint: OtpHint | null;
    error: string | null;
    loading: boolean;
    onBack: () => void;
    /** Defaults to "Choose a different method" — pass "Use a different account" when this method was the
     * only one available (there was no method list to return to; `onBack` goes to the identifier step instead). */
    backLabel?: string;

    password: string;
    setPassword: (value: string) => void;
    onPasswordSubmit: (e: FormEvent) => void;

    totpCode: string;
    setTotpCode: (value: string) => void;
    onTotpSubmit: (e: FormEvent) => void;

    otpStep: "contact" | "code";
    otpContact: string;
    setOtpContact: (value: string) => void;
    otpCode: string;
    setOtpCode: (value: string) => void;
    onOtpContactSubmit: (e: FormEvent) => void;
    onOtpVerifySubmit: (e: FormEvent) => void;
    onOtpBackToContact: () => void;

    onPasskeySignIn: () => void;
    onFido2SignIn: () => void;
}

export default function ChallengeStep({
    method,
    identifier,
    selectedOtpHint,
    error,
    loading,
    onBack,
    backLabel = "Choose a different method",
    password,
    setPassword,
    onPasswordSubmit,
    totpCode,
    setTotpCode,
    onTotpSubmit,
    otpStep,
    otpContact,
    setOtpContact,
    otpCode,
    setOtpCode,
    onOtpContactSubmit,
    onOtpVerifySubmit,
    onOtpBackToContact,
    onPasskeySignIn,
    onFido2SignIn,
}: ChallengeStepProps) {
    return (
        <div>
            <div className="rr-card__title">
                {method === "otp" ? CONTACT_TYPE_LABELS[selectedOtpHint!.type] : FIXED_METHOD_LABELS[method]}
            </div>
            <p className="rr-card__subtitle">
                Signing in as <strong>{identifier}</strong>.
            </p>

            {error && <Alert>{error}</Alert>}

            {method === "password" && (
                <PasswordChallenge password={password} setPassword={setPassword} loading={loading} onSubmit={onPasswordSubmit} />
            )}

            {method === "totp" && (
                <TotpChallenge totpCode={totpCode} setTotpCode={setTotpCode} loading={loading} onSubmit={onTotpSubmit} />
            )}

            {method === "otp" && (
                <OtpChallenge
                    otpStep={otpStep}
                    selectedOtpHint={selectedOtpHint!}
                    otpContact={otpContact}
                    setOtpContact={setOtpContact}
                    otpCode={otpCode}
                    setOtpCode={setOtpCode}
                    loading={loading}
                    onSubmitContact={onOtpContactSubmit}
                    onSubmitVerify={onOtpVerifySubmit}
                    onBackToContact={onOtpBackToContact}
                />
            )}

            {method === "passkey" && <PasskeyChallenge loading={loading} onSignIn={onPasskeySignIn} />}

            {method === "fido2" && <Fido2Challenge loading={loading} onSignIn={onFido2SignIn} />}

            <Button variant="text" type="button" style={{ marginTop: "0.5rem" }} onClick={onBack}>
                {backLabel}
            </Button>
        </div>
    );
}
