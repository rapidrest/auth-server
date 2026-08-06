import React, { FormEvent } from "react";
import FormField from "../../forms/FormField.js";
import CodeInput from "../../forms/CodeInput.js";
import Button from "../../buttons/Button.js";
import { OtpHint } from "../types.js";

export interface OtpChallengeProps {
    otpStep: "contact" | "code";
    selectedOtpHint: OtpHint;
    otpContact: string;
    setOtpContact: (value: string) => void;
    otpCode: string;
    setOtpCode: (value: string) => void;
    loading: boolean;
    onSubmitContact: (e: FormEvent) => void;
    onSubmitVerify: (e: FormEvent) => void;
    onBackToContact: () => void;
}

export default function OtpChallenge({
    otpStep,
    selectedOtpHint,
    otpContact,
    setOtpContact,
    otpCode,
    setOtpCode,
    loading,
    onSubmitContact,
    onSubmitVerify,
    onBackToContact,
}: OtpChallengeProps) {
    return (
        <>
            {otpStep === "contact" && (
                <form onSubmit={onSubmitContact}>
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        We can send a code to {selectedOtpHint.contact}. Enter it below to receive a one-time code.
                    </p>
                    <FormField label="E-mail or phone" htmlFor="otpContact">
                        <input
                            id="otpContact"
                            className="rr-input"
                            type="text"
                            required
                            value={otpContact}
                            onChange={(e) => setOtpContact(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </FormField>
                    <Button type="submit" loading={loading} disabled={loading}>
                        Send code
                    </Button>
                </form>
            )}

            {otpStep === "code" && (
                <form onSubmit={onSubmitVerify}>
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        We sent a code to {otpContact}.
                    </p>
                    <FormField label="One-time code" htmlFor="otpCode">
                        <CodeInput id="otpCode" value={otpCode} onChange={setOtpCode} />
                    </FormField>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <Button type="submit" loading={loading} disabled={loading}>
                            Sign in
                        </Button>
                        <Button variant="secondary" type="button" onClick={onBackToContact}>
                            Use a different contact
                        </Button>
                    </div>
                </form>
            )}
        </>
    );
}
