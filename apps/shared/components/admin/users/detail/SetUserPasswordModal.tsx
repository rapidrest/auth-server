///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import Modal from "../../../../lib/Modal.js";
import { ApiRequestError, updateSecret } from "../../../../lib/api.js";
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
            const existing = (secrets ?? []).find((s) => s.type === "password");
            const saved = existing
                ? await updateSecret({ uid: existing.uid, version: existing.version, data: password })
                : await createUserPasswordSecret(uid, password, "Set by administrator");
            onSaved([...(secrets ?? []).filter((s) => s.type !== "password"), saved]);
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
