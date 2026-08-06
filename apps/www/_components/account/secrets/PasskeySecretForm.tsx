import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { ApiRequestError, getPasskeyRegistrationOptions, registerPasskey, SecretSummary } from "../../../_lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface PasskeySecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

export default function PasskeySecretForm({ setSecrets, onClose }: PasskeySecretFormProps) {
    const [hint, setHint] = useState("");
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAddPasskey(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const optionsJSON = (await getPasskeyRegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerPasskey(response, hint.trim() || undefined);
            setSecrets((prev) => [...(prev ?? []), created]);
            onClose();
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

    return (
        <form onSubmit={handleAddPasskey}>
            {error && <Alert>{error}</Alert>}
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Your browser will prompt you to create a passkey.
            </p>
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
            <Button type="submit" style={{ width: "auto" }} loading={adding} disabled={adding}>
                Add passkey
            </Button>
        </form>
    );
}
