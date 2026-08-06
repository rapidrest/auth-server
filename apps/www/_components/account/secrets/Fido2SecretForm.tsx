import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { ApiRequestError, getFido2RegistrationOptions, registerFido2, SecretSummary } from "../../../_lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface Fido2SecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

export default function Fido2SecretForm({ setSecrets, onClose }: Fido2SecretFormProps) {
    const [hint, setHint] = useState("");
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAddFido2(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const optionsJSON = (await getFido2RegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerFido2(response, hint.trim() || undefined);
            setSecrets((prev) => [...(prev ?? []), created]);
            onClose();
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Security key setup was cancelled.");
            } else {
                setError(err instanceof ApiRequestError ? err.message : "Could not add a security key.");
            }
        } finally {
            setAdding(false);
        }
    }

    return (
        <form onSubmit={handleAddFido2}>
            {error && <Alert>{error}</Alert>}
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Insert your security key and follow your browser&rsquo;s prompt.
            </p>
            <FormField label="Label (optional)" htmlFor="fido2Hint">
                <input
                    id="fido2Hint"
                    className="rr-input"
                    type="text"
                    placeholder="e.g. YubiKey"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                />
            </FormField>
            <Button type="submit" style={{ width: "auto" }} loading={adding} disabled={adding}>
                Add security key
            </Button>
        </form>
    );
}
