///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import Modal from "../../../../lib/Modal.js";
import { ApiRequestError, PASSWORD_SET_BY_ADMIN_HINT, updateSecret } from "../../../../lib/api.js";
import { getSystemSettings } from "../../../../lib/systemSettings.js";
import { AdminSecretSummary, AdminUser, createUserPasswordSecret, getUser, updateUser } from "../../../../lib/adminApi.js";
import { generatePassword, isPasswordValid, usePasswordRequirements } from "../../../../lib/passwordCriteria.js";
import Alert from "../../../feedback/Alert.js";
import PasswordFieldset from "../../../forms/PasswordFieldset.js";
import Button from "../../../buttons/Button.js";

export interface SetUserPasswordModalProps {
    open: boolean;
    onClose: () => void;
    uid: string;
    secrets: AdminSecretSummary[] | null;
    onSaved: (secrets: AdminSecretSummary[]) => void;
    /** Called with the account when saving changed whether it must change its password (which bumps its `version`). */
    onUserUpdated?: (user: AdminUser) => void;
}

export default function SetUserPasswordModal({ open, onClose, uid, secrets, onSaved, onUserUpdated }: SetUserPasswordModalProps) {
    const { requirements, criteria } = usePasswordRequirements();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    // Both default on: this is how an admin hands over a temporary password, e.g. to recover an account.
    const [allowPasswordChange, setAllowPasswordChange] = useState(true);
    const [requirePasswordChange, setRequirePasswordChange] = useState(true);
    // Whether the server lets an account have several passwords (`SystemSettings.allowMultiplePasswords`). If so, and
    // the account already has one, the administrator can add a password of their own alongside it instead of
    // replacing it - which is how they keep their own way into the account.
    const [multiplePasswords, setMultiplePasswords] = useState(false);
    const [addAdditional, setAddAdditional] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const existing = (secrets ?? []).find((s) => s.type === "password");
    const canAddAdditional = multiplePasswords && !!existing;
    const additional = canAddAdditional && addAdditional;

    useEffect(() => {
        if (!open) return;
        getSystemSettings()
            .then((settings) => setMultiplePasswords(settings.allowMultiplePasswords === true))
            .catch(() => setMultiplePasswords(false));
    }, [open]);

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
            // `updateSecret()` (from the self-service `lib/api.ts`) returns the general `SecretSummary` shape,
            // whose `type` now also allows `"app-password"` — but `existing` is only ever found above when its
            // `type` is already `"password"`, and an update never changes a secret's `type`, so the result is
            // provably still an `AdminSecretSummary` even though the general return type can't express that.
            if (additional) {
                // A password of the administrator's own, next to the holder's: one the holder can't change (the
                // server gives them no rights on it unless asked), so it stays the administrator's way in. The
                // account's other password, and whether it must be changed, are none of its business.
                const added = await createUserPasswordSecret(uid, password, PASSWORD_SET_BY_ADMIN_HINT, false);
                onSaved([...(secrets ?? []), added]);
            } else {
                // Being required to change the password implies being allowed to.
                const allowChange = allowPasswordChange || requirePasswordChange;
                // Says `allowUserChange` either way: `false` isn't "leave it" but "take it away", including from a
                // password the holder had chosen and could change themselves. The hint is put back too, since the
                // password is the administrator's again.
                const saved = existing
                    ? ((await updateSecret(
                          { uid: existing.uid, version: existing.version, data: password, hint: PASSWORD_SET_BY_ADMIN_HINT },
                          existing.userUid,
                          { allowUserChange: allowChange },
                      )) as AdminSecretSummary)
                    : await createUserPasswordSecret(uid, password, PASSWORD_SET_BY_ADMIN_HINT, allowChange);
                onSaved([...(secrets ?? []).filter((s) => s.type !== "password"), saved]);

                // The requirement lives on the account rather than the password, and is set (or lifted) to match
                // this choice every time - so an account recovery that leaves it unchecked also clears a requirement
                // left over from an earlier reset. Re-read the account for its current `version` first.
                const account = await getUser(uid);
                if (!!account.passwordChangeRequired !== requirePasswordChange) {
                    // Awaited before the optional call: `handler?.(await ...)` skips evaluating its argument (and so
                    // the update itself) when there's no handler.
                    const updated = await updateUser({ uid, version: account.version, passwordChangeRequired: requirePasswordChange });
                    onUserUpdated?.(updated);
                }
            }

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
                    onGenerate={() => {
                        const generated = generatePassword(requirements);
                        setPassword(generated);
                        setConfirmPassword(generated);
                    }}
                />
                {canAddAdditional && (
                    <div className="rr-field">
                        <label htmlFor="adminSetAdditional" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <input
                                id="adminSetAdditional"
                                type="checkbox"
                                checked={addAdditional}
                                onChange={(e) => setAddAdditional(e.target.checked)}
                            />
                            Add as an additional password, keeping the user&rsquo;s current one
                        </label>
                        <p className="rr-hint">
                            Sign-in accepts any of an account&rsquo;s passwords. This one is yours: the user can&rsquo;t
                            change or remove it, so you keep your own way into the account.
                        </p>
                    </div>
                )}
                {!additional && (
                    <>
                <div className="rr-field">
                    <label htmlFor="adminSetAllowChange" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                            id="adminSetAllowChange"
                            type="checkbox"
                            checked={allowPasswordChange || requirePasswordChange}
                            disabled={requirePasswordChange}
                            onChange={(e) => setAllowPasswordChange(e.target.checked)}
                        />
                        Allow the user to change their password
                    </label>
                </div>
                <div className="rr-field">
                    <label htmlFor="adminSetRequireChange" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                            id="adminSetRequireChange"
                            type="checkbox"
                            checked={requirePasswordChange}
                            onChange={(e) => setRequirePasswordChange(e.target.checked)}
                        />
                        Require the user to change their password at next sign-in
                    </label>
                </div>
                    </>
                )}
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
