///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import Modal from "../../../lib/Modal.js";
import { ApiRequestError, SecretSummary, updateSecret } from "../../../lib/api.js";
import { isPasswordValid, usePasswordRequirements } from "../../../lib/passwordCriteria.js";
import Alert from "../../feedback/Alert.js";
import PasswordFieldset from "../../forms/PasswordFieldset.js";
import Button from "../../buttons/Button.js";

export interface ChangePasswordModalProps {
    /** The caller's existing `password` secret to change, or `null` while the modal is closed. */
    secret: SecretSummary | null;
    onClose: () => void;
    /** Called with the updated secret once the new password has been saved, just before `onClose()`. */
    onSaved: (saved: SecretSummary) => void;
}

interface ChangePasswordFormProps {
    secret: SecretSummary;
    onClose: () => void;
    onSaved: (saved: SecretSummary) => void;
}

/**
 * The form half of `ChangePasswordModal`, split out so its state (typed passwords, any error) is unmounted —
 * and so reset — whenever `Modal` closes, rather than lingering into the next time it opens.
 */
function ChangePasswordForm({ secret, onClose, onSaved }: ChangePasswordFormProps) {
    const { criteria } = usePasswordRequirements();
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
            // A `PUT /secrets/:id` with only `data` — the existing `hint` (and everything else) is left as is.
            // Elevation is prompted for, and the request retried, by `apiFetch` itself.
            const saved = await updateSecret({ uid: secret.uid, version: secret.version, data: newPassword }, secret.userUid);
            onSaved(saved);
            onClose();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not change your password.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}
            <PasswordFieldset
                id="changePassword"
                label="New password"
                confirmId="confirmChangePassword"
                confirmLabel="Confirm new password"
                value={newPassword}
                onChange={setNewPassword}
                confirmValue={confirmNewPassword}
                onConfirmChange={setConfirmNewPassword}
                criteria={criteria}
            />
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

/**
 * Changes the caller's existing password in place — updates the `password` secret via `PUT /secrets/:id`
 * (see `updateSecret()`) rather than removing it and creating a replacement, so its label and creation date
 * survive. The new password is entered and confirmed against the same requirements as when first creating
 * one, and hashed client-side before submission exactly the same way.
 */
export default function ChangePasswordModal({ secret, onClose, onSaved }: ChangePasswordModalProps) {
    return (
        <Modal open={secret !== null} onClose={onClose} title="Change password">
            {secret && <ChangePasswordForm secret={secret} onClose={onClose} onSaved={onSaved} />}
        </Modal>
    );
}
