///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import Modal from "../../../lib/Modal.js";
import {
    ApiRequestError,
    INVALID_OBJECT_VERSION,
    listSecrets,
    PASSWORD_SET_BY_ADMIN_HINT,
    SecretSummary,
    updateSecret,
} from "../../../lib/api.js";
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
    /** Explanatory text shown above the form, e.g. why a change is being demanded. */
    notice?: string;
    /**
     * Shows a "Sign out" button. For a dialog that can't be dismissed (see `notice`): whatever goes wrong, the
     * person in front of it always has a way out.
     */
    onSignOut?: () => void;
}

interface ChangePasswordFormProps {
    secret: SecretSummary;
    onClose: () => void;
    onSaved: (saved: SecretSummary) => void;
    notice?: string;
    onSignOut?: () => void;
}

/**
 * The form half of `ChangePasswordModal`, split out so its state (typed passwords, any error) is unmounted —
 * and so reset — whenever `Modal` closes, rather than lingering into the next time it opens.
 */
function ChangePasswordForm({ secret, onClose, onSaved, notice, onSignOut }: ChangePasswordFormProps) {
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
            // A label saying an administrator set the password stops being true the moment its holder replaces it, so
            // it's cleared with the change. One they chose themselves (e.g. "LastPass") is theirs to keep.
            const hint = secret.hint === PASSWORD_SET_BY_ADMIN_HINT ? { hint: "" } : {};
            let saved: SecretSummary;
            try {
                saved = await updateSecret({ uid: secret.uid, version: secret.version, data: newPassword, ...hint }, secret.userUid);
            } catch (err) {
                if (!(err instanceof ApiRequestError && err.code === INVALID_OBJECT_VERSION)) {
                    throw err;
                }
                // The secret changed since it was loaded — signing in, or elevating for this very change, stamps its
                // `lastUsedAt` and so bumps its `version`. Nothing here was edited by anyone else, so take the
                // current version and go again, once, rather than making the user work it out.
                const latest = (await listSecrets()).find((s) => s.uid === secret.uid);
                if (!latest) {
                    throw err;
                }
                saved = await updateSecret({ uid: secret.uid, version: latest.version, data: newPassword, ...hint }, secret.userUid);
            }
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
            {notice && (
                <p className="rr-hint" style={{ marginTop: 0 }}>
                    {notice}
                </p>
            )}
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
            {onSignOut && (
                <Button variant="secondary" type="button" style={{ width: "auto", marginLeft: "0.5rem" }} onClick={onSignOut}>
                    Sign out
                </Button>
            )}
        </form>
    );
}

/**
 * Changes the caller's existing password in place — updates the `password` secret via `PUT /secrets/:id`
 * (see `updateSecret()`) rather than removing it and creating a replacement, so its label and creation date
 * survive. The new password is entered and confirmed against the same requirements as when first creating
 * one, and hashed client-side before submission exactly the same way.
 */
export default function ChangePasswordModal({ secret, onClose, onSaved, notice, onSignOut }: ChangePasswordModalProps) {
    return (
        <Modal open={secret !== null} onClose={onClose} title="Change password">
            {secret && (
                <ChangePasswordForm secret={secret} onClose={onClose} onSaved={onSaved} notice={notice} onSignOut={onSignOut} />
            )}
        </Modal>
    );
}
