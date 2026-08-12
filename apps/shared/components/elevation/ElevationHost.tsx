import React, { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { FiHardDrive, FiMail, FiShield } from "react-icons/fi";
import {
    ApiRequestError,
    beginElevationChallenge,
    completeElevationChallenge,
    completeElevationFido2,
    ElevationMethod,
    elevateWithPassword,
    listElevationMethods,
} from "../../lib/api.js";
import { isElevationRequested, resolveElevation, subscribeElevation } from "../../lib/elevation.js";
import Modal from "../../lib/Modal.js";
import Alert from "../feedback/Alert.js";
import Button from "../buttons/Button.js";
import FormField from "../forms/FormField.js";
import CodeInput from "../forms/CodeInput.js";

type Step = "loading" | "password" | "methods" | "code" | "fido2" | "error";

function methodLabel(method: ElevationMethod): string {
    switch (method.type) {
        case "fido2":
            return "Hardware key";
        case "totp":
            return "Authenticator app";
        case "otp":
            return method.data?.contact ? `Code to ${method.data.contact}` : "One-time code";
    }
}

function methodIcon(type: ElevationMethod["type"]) {
    switch (type) {
        case "fido2":
            return <FiHardDrive size={18} aria-hidden="true" />;
        case "otp":
            return <FiMail size={18} aria-hidden="true" />;
        case "totp":
            return <FiShield size={18} aria-hidden="true" />;
    }
}

/**
 * Renders the elevation challenge prompt described by `BaseAuthElevationRoute` whenever `apiFetch` (see
 * `api.ts`) intercepts an `AUTH_REQUIRES_ELEVATION` response — mounted once near the root of each app
 * (`apps/www/_layout.tsx`, `apps/admin/_layout.tsx`) so every page, and every API call any page makes, gets
 * this behavior automatically without needing to know elevation exists.
 *
 * Mirrors `SignInFlow`'s `MfaStep`/`Fido2Challenge` (same method types, same "select then complete" shape)
 * but scoped to the caller's own uid throughout (there's no identifier to type) and with one extra case
 * `MfaStep` never has to handle: zero enrolled methods, elevated via password instead (see
 * `BaseAuthElevationRoute`'s doc comment on why that fallback exists).
 */
export default function ElevationHost() {
    const open = useSyncExternalStore(subscribeElevation, isElevationRequested, () => false);

    const [step, setStep] = useState<Step>("loading");
    const [methods, setMethods] = useState<ElevationMethod[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<ElevationMethod | null>(null);
    const [fido2Options, setFido2Options] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        // Freshly (re)opened — reset any state left over from a previous prompt and load the caller's
        // current methods, same as SignInFlow does for a fresh sign-in attempt.
        setStep("loading");
        setMethods([]);
        setSelectedMethod(null);
        setFido2Options(null);
        setCode("");
        setPassword("");
        setLoading(false);
        setError(null);

        listElevationMethods()
            .then((result) => {
                if (result.length === 0) {
                    setStep("password");
                } else {
                    setMethods(result);
                    setStep("methods");
                }
            })
            .catch((err) => {
                setError(err instanceof ApiRequestError ? err.message : "Could not load your elevation methods.");
                setStep("error");
            });
    }, [open]);

    function handleCancel() {
        resolveElevation(false);
    }

    async function handleSelectMethod(method: ElevationMethod) {
        setError(null);
        setLoading(true);
        try {
            const result = await beginElevationChallenge(method.id);
            setSelectedMethod(method);
            if (method.type === "fido2") {
                setFido2Options(result);
                setStep("fido2");
            } else {
                setStep("code");
            }
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
            await completeElevationChallenge(code.trim());
            resolveElevation(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handleFido2SignIn() {
        setError(null);
        setLoading(true);
        try {
            const response = await startAuthentication({ optionsJSON: fido2Options! });
            await completeElevationFido2(response);
            resolveElevation(true);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Hardware key confirmation was cancelled.");
            } else {
                setError(err instanceof ApiRequestError ? "Hardware key confirmation failed." : "Something went wrong. Please try again.");
            }
            setLoading(false);
        }
    }

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await elevateWithPassword(password);
            resolveElevation(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Incorrect password." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    function backToMethods() {
        setError(null);
        setSelectedMethod(null);
        setFido2Options(null);
        setCode("");
        setStep("methods");
    }

    return (
        <Modal open={open} onClose={handleCancel} title="Confirm it’s you">
            <p className="rr-card__subtitle" style={{ marginTop: 0 }}>
                This action requires you to confirm your identity again.
            </p>

            {error && <Alert>{error}</Alert>}

            {step === "loading" && <p className="rr-hint">Loading&hellip;</p>}

            {step === "methods" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {methods.map((method) => (
                        <Button
                            key={method.id}
                            variant="secondary"
                            type="button"
                            disabled={loading}
                            onClick={() => handleSelectMethod(method)}
                        >
                            {methodIcon(method.type)}
                            {methodLabel(method)}
                        </Button>
                    ))}
                </div>
            )}

            {step === "code" && selectedMethod && (
                <form onSubmit={handleCodeSubmit}>
                    <FormField label={selectedMethod.type === "totp" ? "Authenticator code" : "One-time code"} htmlFor="elevationCode">
                        <CodeInput id="elevationCode" value={code} onChange={setCode} />
                    </FormField>
                    <Button type="submit" loading={loading} disabled={loading}>
                        Confirm
                    </Button>
                </form>
            )}

            {step === "fido2" && (
                <div className="rr-field">
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        Insert your security key and follow your browser&rsquo;s prompt.
                    </p>
                    <Button type="button" onClick={handleFido2SignIn} loading={loading} disabled={loading}>
                        Continue with security key
                    </Button>
                </div>
            )}

            {step === "password" && (
                <form onSubmit={handlePasswordSubmit}>
                    <FormField label="Password" htmlFor="elevationPassword">
                        <input
                            id="elevationPassword"
                            className="rr-input"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </FormField>
                    <Button type="submit" loading={loading} disabled={loading}>
                        Confirm
                    </Button>
                </form>
            )}

            {(step === "code" || step === "fido2") && methods.length > 1 && (
                <Button variant="text" type="button" style={{ marginTop: "0.5rem" }} onClick={backToMethods} disabled={loading}>
                    Choose a different method
                </Button>
            )}

            <Button variant="text" type="button" style={{ marginTop: "0.5rem" }} onClick={handleCancel}>
                Cancel
            </Button>
        </Modal>
    );
}
