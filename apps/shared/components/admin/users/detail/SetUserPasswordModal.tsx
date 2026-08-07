import React, { FormEvent, useState } from "react";
import Modal from "../../../../lib/Modal.js";
import { ApiRequestError, deleteSecret } from "../../../../lib/api.js";
import { AdminSecretSummary, createUserPasswordSecret } from "../../../../lib/adminApi.js";
import { isPasswordValid, usePasswordRequirements } from "../../../../lib/passwordCriteria.js";
import Alert from "../../../feedback/Alert.js";
import PasswordFieldset from "../../../forms/PasswordFieldset.js";
import Button from "../../../buttons/Button.js";

export interface SetUserPasswordModalProps {
    open: boolean;
    onClose: () => void;
    uid: string;
    secrets: AdminSecretSummary[] | null;
    onSaved: (secrets: AdminSecretSummary[]) => void;
}

export default function SetUserPasswordModal({ open, onClose, uid, secrets, onSaved }: SetUserPasswordModalProps) {
    const { criteria } = usePasswordRequirements();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!isPasswordValid(password, criteria)) {
            setError("Password does not meet the requirements below.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSaving(true);
        try {
            const created = await createUserPasswordSecret(uid, password, "Set by administrator");
            // Secrets have no update endpoint — "changing" a password means creating the new one, then
            // removing any old password secret(s) (mirrors PasswordSecretForm's self-service flow).
            const oldPasswords = (secrets ?? []).filter((s) => s.type === "password");
            for (const old of oldPasswords) {
                await deleteSecret(old.uid);
            }
            onSaved([...(secrets ?? []).filter((s) => s.type !== "password"), created]);
            setPassword("");
            setConfirmPassword("");
            onClose();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not set this account's password.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Set password">
            {error && <Alert>{error}</Alert>}
            <form onSubmit={handleSubmit}>
                <PasswordFieldset
                    id="adminSetPassword"
                    label="New password"
                    confirmId="adminSetConfirmPassword"
                    confirmLabel="Confirm new password"
                    value={password}
                    onChange={setPassword}
                    confirmValue={confirmPassword}
                    onConfirmChange={setConfirmPassword}
                    criteria={criteria}
                />
                <Button
                    type="submit"
                    style={{ width: "auto" }}
                    loading={saving}
                    disabled={saving || !isPasswordValid(password, criteria) || password !== confirmPassword}
                >
                    Save password
                </Button>
            </form>
        </Modal>
    );
}
