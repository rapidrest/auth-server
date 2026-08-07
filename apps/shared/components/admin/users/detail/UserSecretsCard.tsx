import React, { useEffect, useState } from "react";
import { ApiRequestError, deleteSecret } from "../../../../lib/api.js";
import { AdminSecretSummary, listUserSecrets } from "../../../../lib/adminApi.js";
import Alert from "../../../feedback/Alert.js";
import Button from "../../../buttons/Button.js";
import SetUserPasswordModal from "./SetUserPasswordModal.js";

export interface UserSecretsCardProps {
    uid: string;
}

const SECRET_TYPE_LABELS: Record<AdminSecretSummary["type"], string> = {
    password: "Password",
    totp: "Authenticator app",
    passkey: "Passkey",
    fido2: "Hardware key",
};

function formatDate(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return iso;
    }
}

export default function UserSecretsCard({ uid }: UserSecretsCardProps) {
    const [secrets, setSecrets] = useState<AdminSecretSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setPasswordOpen, setSetPasswordOpen] = useState(false);

    useEffect(() => {
        listUserSecrets(uid)
            .then(setSecrets)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this account's sign-in methods."));
    }, [uid]);

    async function handleDelete(uidToDelete: string, label: string) {
        if (!window.confirm(`Remove ${label}? The account holder will no longer be able to use it to sign in.`)) {
            return;
        }
        setError(null);
        try {
            await deleteSecret(uidToDelete);
            // Reachable only via an existing row's own "Remove" button, which only exists once `secrets`
            // has already loaded — `prev` is never null here (mirrors SecretsCard's identical reasoning).
            setSecrets((prev) => prev!.filter((s) => s.uid !== uidToDelete));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove that sign-in method.");
        }
    }

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div className="rr-card__title">Sign-in methods</div>
                    <p className="rr-card__subtitle">
                        Passwords, authenticator apps, passkeys, and security keys. Only a password can be provisioned by
                        an administrator — passkeys and security keys require the account holder's own device.
                    </p>
                </div>
                <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setSetPasswordOpen(true)}>
                    Set password
                </Button>
            </div>
            {error && <Alert>{error}</Alert>}
            {secrets !== null && secrets.length === 0 && <p className="rr-hint">No sign-in methods registered.</p>}
            {secrets && secrets.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Added</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {secrets.map((s) => (
                                <tr key={s.uid}>
                                    <td>
                                        {SECRET_TYPE_LABELS[s.type]}
                                        {s.hint && (
                                            <span className="rr-hint" style={{ marginLeft: "0.4rem" }}>
                                                ({s.hint})
                                            </span>
                                        )}
                                    </td>
                                    <td>{formatDate(s.dateCreated)}</td>
                                    <td>
                                        <Button
                                            variant="text"
                                            type="button"
                                            onClick={() => handleDelete(s.uid, SECRET_TYPE_LABELS[s.type].toLowerCase())}
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

            <SetUserPasswordModal
                open={setPasswordOpen}
                onClose={() => setSetPasswordOpen(false)}
                uid={uid}
                secrets={secrets}
                onSaved={setSecrets}
            />
        </div>
    );
}
