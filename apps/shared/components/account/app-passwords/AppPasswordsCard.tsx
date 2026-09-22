///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { Dispatch, SetStateAction, useState } from "react";
import { ApiRequestError, deleteSecret, SecretSummary } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import CreateAppPasswordModal from "./CreateAppPasswordModal.js";

function formatDate(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return iso;
    }
}

/**
 * `lastUsedAt` formatted for display, or "Never used" when the app password has never authenticated a
 * sign-in — the case this card exists to make visible: app passwords are meant to be checked periodically
 * for staleness, so a stale/unused one reads as a plain, actionable fact rather than a vague default.
 */
function formatLastUsed(iso: string | undefined): string {
    return iso ? formatDate(iso) : "Never used";
}

export interface AppPasswordsCardProps {
    /** The full shared secrets list (every type) — filtered down to `app-password` entries internally, the
     * same shared state `SecretsCard` reads (and deliberately excludes `app-password` from). */
    secrets: SecretSummary[] | null;
    /** Load error from the account page's initial fetch (as opposed to `secretError`, set locally on a failed delete). */
    secretsError: string | null;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
}

/**
 * Lets the account holder create and manage app passwords: separate, server-generated passwords for signing
 * in from an app that can't respond to a two-factor prompt — an older e-mail client talking HTTP Basic Auth to
 * this server's `/auth/basic`, for example. Each one is its own secret, shown in plaintext exactly once at
 * creation (see `CreateAppPasswordModal`) and otherwise indistinguishable from any other password to look at —
 * only its label says which app it's for. There's no "Change": an app password is immutable once created, so
 * rotating one means removing it here and creating a new one.
 */
export default function AppPasswordsCard({ secrets, secretsError, setSecrets }: AppPasswordsCardProps) {
    const [secretError, setSecretError] = useState<string | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const appPasswords = secrets === null ? null : secrets.filter((s) => s.type === "app-password");

    async function handleDeleteSecret(uid: string, label: string) {
        if (!window.confirm(`Remove the app password "${label}"? Any app using it will stop working immediately.`)) {
            return;
        }
        setSecretError(null);
        try {
            await deleteSecret(uid);
            // Reachable only via a row's own "Remove" button, which only exists once `secrets` has
            // already loaded — `prev` is never null here.
            setSecrets((prev) => prev!.filter((s) => s.uid !== uid));
        } catch (err) {
            setSecretError(err instanceof ApiRequestError ? err.message : "Could not remove that app password.");
        }
    }

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div className="rr-card__title">App passwords</div>
                    <p className="rr-card__subtitle">
                        For an app that can&rsquo;t ask you for a second factor, like an older e-mail client — sign in
                        there with a separate password made just for that app instead of your regular one.
                    </p>
                </div>
                <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setCreateModalOpen(true)}>
                    +
                </Button>
            </div>
            {secretsError && <Alert>{secretsError}</Alert>}
            {secretError && <Alert>{secretError}</Alert>}
            {appPasswords !== null && appPasswords.length === 0 && <p className="rr-hint">No app passwords added yet.</p>}
            {appPasswords && appPasswords.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>Label</th>
                                <th>Added</th>
                                <th>Last used</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {appPasswords.map((s) => (
                                <tr key={s.uid}>
                                    <td>{s.hint}</td>
                                    <td>{formatDate(s.dateCreated)}</td>
                                    <td>{formatLastUsed(s.lastUsedAt)}</td>
                                    <td>
                                        <Button
                                            variant="text"
                                            type="button"
                                            onClick={() => handleDeleteSecret(s.uid, s.hint ?? "")}
                                        >
                                            Remove
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CreateAppPasswordModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} setSecrets={setSecrets} />
        </div>
    );
}
