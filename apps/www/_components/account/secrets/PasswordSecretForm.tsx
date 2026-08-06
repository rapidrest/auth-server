import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import { ApiRequestError, createPasswordSecret, deleteSecret, SecretSummary } from "../../../_lib/api.js";
import { isPasswordValid, usePasswordRequirements } from "../../../_lib/passwordCriteria.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import PasswordFieldset from "../../forms/PasswordFieldset.js";
import Button from "../../buttons/Button.js";

export interface PasswordSecretFormProps {
    secrets: SecretSummary[] | null;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

export default function PasswordSecretForm({ secrets, setSecrets, onClose }: PasswordSecretFormProps) {
    const { criteria } = usePasswordRequirements();
    const [hint, setHint] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!isPasswordValid(newPassword, criteria)) {
            setError("Password does not meet the requirements below.");
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSaving(true);
        try {
            const created = (await createPasswordSecret(newPassword, hint.trim() || undefined)) as SecretSummary;
            // Secrets have no update endpoint — "changing" a password means creating the new one, then
            // removing any old password secret(s), as two separate (non-atomic) requests.
            const oldPasswords = (secrets ?? []).filter((s) => s.type === "password");
            for (const old of oldPasswords) {
                await deleteSecret(old.uid);
            }
            setSecrets((prev) => [...(prev ?? []).filter((s) => s.type !== "password"), created]);
            onClose();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save your password.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}
            <PasswordFieldset
                id="newPassword"
                label="New password"
                confirmId="confirmNewPassword"
                confirmLabel="Confirm new password"
                value={newPassword}
                onChange={setNewPassword}
                confirmValue={confirmNewPassword}
                onConfirmChange={setConfirmNewPassword}
                criteria={criteria}
            />
            <FormField label="Label (optional)" htmlFor="passwordHint">
                <input
                    id="passwordHint"
                    className="rr-input"
                    type="text"
                    placeholder="e.g. LastPass, 1Password"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                />
            </FormField>
            <Button
                type="submit"
                style={{ width: "auto" }}
                loading={saving}
                disabled={saving || !isPasswordValid(newPassword, criteria) || newPassword !== confirmNewPassword}
            >
                Save password
            </Button>
        </form>
    );
}
