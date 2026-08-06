import React, { useEffect, useState } from "react";
import { ApiRequestError, deleteSecret, listSecrets, SecretSummary, SecretType } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import AddSecretModal, { AddMethodType } from "./AddSecretModal.js";

const SECRET_TYPE_LABELS: Record<SecretType, string> = {
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

export default function SecretsCard() {
    const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
    const [secretError, setSecretError] = useState<string | null>(null);

    const [addMethodModalOpen, setAddMethodModalOpen] = useState(false);
    const [addMethodType, setAddMethodType] = useState<AddMethodType>(null);

    useEffect(() => {
        listSecrets()
            .then(setSecrets)
            .catch((err) => setSecretError(err instanceof ApiRequestError ? err.message : "Could not load your sign-in methods."));
    }, []);

    function closeAddMethodModal() {
        setAddMethodModalOpen(false);
        setAddMethodType(null);
    }

    async function handleDeleteSecret(uid: string, label: string) {
        if (!window.confirm(`Remove ${label}? You will no longer be able to use it to sign in.`)) {
            return;
        }
        setSecretError(null);
        try {
            await deleteSecret(uid);
            // Reachable only via a row's own "Remove" button, which only exists once `secrets` has
            // already loaded — `prev` is never null here.
            setSecrets((prev) => prev!.filter((s) => s.uid !== uid));
        } catch (err) {
            setSecretError(err instanceof ApiRequestError ? err.message : "Could not remove that sign-in method.");
        }
    }

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div className="rr-card__title">Sign-in methods</div>
                    <p className="rr-card__subtitle">Passwords, authenticator apps, passkeys, and security keys.</p>
                </div>
                <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setAddMethodModalOpen(true)}>
                    +
                </Button>
            </div>
            {secretError && <Alert>{secretError}</Alert>}
            {secrets !== null && secrets.length === 0 && <p className="rr-hint">No sign-in methods added yet.</p>}
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
                                            onClick={() => handleDeleteSecret(s.uid, SECRET_TYPE_LABELS[s.type].toLowerCase())}
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

            <AddSecretModal
                open={addMethodModalOpen}
                onClose={closeAddMethodModal}
                addMethodType={addMethodType}
                setAddMethodType={setAddMethodType}
                secrets={secrets}
                setSecrets={setSecrets}
            />
        </div>
    );
}
