import React, { FormEvent, ReactNode } from "react";
import { FiHardDrive, FiMail, FiShield } from "react-icons/fi";
import { MfaMethod } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";
import CodeInput from "../../forms/CodeInput.js";
import Fido2Challenge from "../challenges/Fido2Challenge.js";

function methodLabel(method: MfaMethod): string {
    switch (method.type) {
        case "fido2":
            return "Hardware key";
        case "totp":
            return "Authenticator app";
        case "otp":
            return method.data?.contact ? `Code to ${method.data.contact}` : "One-time code";
    }
}

function methodIcon(type: MfaMethod["type"]): ReactNode {
    switch (type) {
        case "fido2":
            return <FiHardDrive size={18} aria-hidden="true" />;
        case "otp":
            return <FiMail size={18} aria-hidden="true" />;
        case "totp":
            return <FiShield size={18} aria-hidden="true" />;
    }
}

export interface MfaStepProps {
    methods: MfaMethod[];
    selectedMethod: MfaMethod | null;
    onSelectMethod: (method: MfaMethod) => void;
    onBackToMethods: () => void;
    onBack: () => void;
    code: string;
    setCode: (value: string) => void;
    onCodeSubmit: (e: FormEvent) => void;
    onFido2SignIn: () => void;
    loading: boolean;
    error: string | null;
}

/**
 * The second-factor step of the `/auth/mfa` sign-in flow, shown after a password has already been
 * verified when the account has one or more registered secondary methods (see `SignInFlow.handlePasswordSubmit`).
 */
export default function MfaStep({
    methods,
    selectedMethod,
    onSelectMethod,
    onBackToMethods,
    onBack,
    code,
    setCode,
    onCodeSubmit,
    onFido2SignIn,
    loading,
    error,
}: MfaStepProps) {
    return (
        <div>
            <div className="rr-card__title">Verify it&rsquo;s you</div>
            <p className="rr-card__subtitle">This account requires a second sign-in step.</p>

            {error && <Alert>{error}</Alert>}

            {!selectedMethod && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {methods.map((method) => (
                        <Button key={method.id} variant="secondary" type="button" onClick={() => onSelectMethod(method)}>
                            {methodIcon(method.type)}
                            {methodLabel(method)}
                        </Button>
                    ))}
                </div>
            )}

            {selectedMethod && (selectedMethod.type === "otp" || selectedMethod.type === "totp") && (
                <form onSubmit={onCodeSubmit}>
                    <FormField label={selectedMethod.type === "totp" ? "Authenticator code" : "One-time code"} htmlFor="mfaCode">
                        <CodeInput id="mfaCode" value={code} onChange={setCode} />
                    </FormField>
                    <Button type="submit" loading={loading} disabled={loading}>
                        Verify
                    </Button>
                </form>
            )}

            {selectedMethod && selectedMethod.type === "fido2" && <Fido2Challenge loading={loading} onSignIn={onFido2SignIn} />}

            <Button
                variant="text"
                type="button"
                style={{ marginTop: "0.5rem" }}
                onClick={selectedMethod ? onBackToMethods : onBack}
            >
                {selectedMethod ? "Choose a different method" : "Use a different account"}
            </Button>
        </div>
    );
}
