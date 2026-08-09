import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { ApiRequestError, getPasskeyRegistrationOptions, registerPasskey, SecretSummary, updateSecret } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface PasskeySecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

export default function PasskeySecretForm({ setSecrets, onClose }: PasskeySecretFormProps) {
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<SecretSummary | null>(null);
    const [hint, setHint] = useState("");
    const [confirming, setConfirming] = useState(false);

    async function handleAddPasskey(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const optionsJSON = (await getPasskeyRegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const result = await registerPasskey(response);
            setSecrets((prev) => [...(prev ?? []), result]);
            setCreated(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Passkey setup was cancelled.");
            } else {
                setError(err instanceof ApiRequestError ? err.message : "Could not add a passkey.");
            }
        } finally {
            setAdding(false);
        }
    }

    async function handleConfirm() {
        // Only reachable via the Confirm button below, which only renders once `created` exists.
        const { uid, version } = created!;
        const trimmedHint = hint.trim();
        if (!trimmedHint) {
            onClose();
            return;
        }
        setError(null);
        setConfirming(true);
        try {
            const updated = await updateSecret({ uid, version, hint: trimmedHint });
            // The create step above always seeds `secrets` before this can run, so `prev` is never null here.
            setSecrets((prev) => prev!.map((s) => (s.uid === updated.uid ? updated : s)));
            onClose();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save the label.");
        } finally {
            setConfirming(false);
        }
    }

    if (created) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                {error && <Alert>{error}</Alert>}
                <p className="rr-hint" style={{ margin: 0 }}>Passkey added.</p>
                <FormField label="Label (optional)" htmlFor="passkeyHint">
                    <input
                        id="passkeyHint"
                        className="rr-input"
                        type="text"
                        placeholder="e.g. iPhone, YubiKey"
                        value={hint}
                        onChange={(e) => setHint(e.target.value)}
                    />
                </FormField>
                <Button type="button" style={{ width: "auto" }} loading={confirming} disabled={confirming} onClick={handleConfirm}>
                    Confirm
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleAddPasskey}>
            {error && <Alert>{error}</Alert>}
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Your browser will prompt you to create a passkey.
            </p>
            <Button type="submit" style={{ width: "auto" }} loading={adding} disabled={adding}>
                Add passkey
            </Button>
        </form>
    );
}
