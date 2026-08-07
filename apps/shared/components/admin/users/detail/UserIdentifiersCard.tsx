import React, { FormEvent, useEffect, useState } from "react";
import { Alias, AliasType, ApiRequestError, deleteAlias } from "../../../../lib/api.js";
import { createUserAlias, listUserAliases } from "../../../../lib/adminApi.js";
import Alert from "../../../feedback/Alert.js";
import Button from "../../../buttons/Button.js";

export interface UserIdentifiersCardProps {
    uid: string;
}

const TYPE_LABELS: Record<AliasType, string> = {
    email: "Email",
    phone: "Phone",
    name: "Username",
    oauth: "OAuth",
};

const ADDABLE_TYPES: AliasType[] = ["email", "phone", "name"];

export default function UserIdentifiersCard({ uid }: UserIdentifiersCardProps) {
    const [aliases, setAliases] = useState<Alias[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [newType, setNewType] = useState<AliasType>("email");
    const [newValue, setNewValue] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    useEffect(() => {
        listUserAliases(uid)
            .then(setAliases)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this account's identifiers."));
    }, [uid]);

    async function handleAdd(e: FormEvent) {
        e.preventDefault();
        if (!newValue.trim()) return;
        setAddError(null);
        setAdding(true);
        try {
            const created = await createUserAlias(uid, newType, newValue.trim());
            setAliases((prev) => [...(prev ?? []), created]);
            setNewValue("");
        } catch (err) {
            setAddError(err instanceof ApiRequestError ? err.message : "Could not add that identifier.");
        } finally {
            setAdding(false);
        }
    }

    async function handleRemove(alias: Alias) {
        if (!window.confirm(`Remove ${alias.alias}?`)) return;
        setError(null);
        try {
            await deleteAlias(alias.uid);
            // Reachable only via an existing row's own "Remove" button, which only exists once `aliases`
            // has already loaded — `prev` is never null here (mirrors SecretsCard's identical reasoning).
            setAliases((prev) => prev!.filter((a) => a.uid !== alias.uid));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove that identifier.");
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Identifiers</div>
            <p className="rr-card__subtitle">
                The e-mail addresses, phone numbers, and usernames this account can sign in with. An admin-added e-mail
                or phone stays unverified until the account holder verifies it themselves.
            </p>
            {error && <Alert>{error}</Alert>}

            {aliases !== null && aliases.length === 0 && <p className="rr-hint">No identifiers on this account.</p>}
            {aliases && aliases.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>Identifier</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {aliases.map((a) => (
                                <tr key={a.uid}>
                                    <td>{a.alias}</td>
                                    <td>{TYPE_LABELS[a.type]}</td>
                                    <td>
                                        <span className={"rr-badge" + (a.verified ? " rr-badge--success" : "")}>
                                            {a.verified ? "Verified" : "Unverified"}
                                        </span>
                                    </td>
                                    <td>
                                        <Button variant="text" type="button" onClick={() => handleRemove(a)}>
                                            Remove
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginTop: "1rem" }}>
                {addError && <Alert>{addError}</Alert>}
                <div className="rr-field" style={{ flex: "0 0 130px", marginBottom: 0 }}>
                    <label htmlFor="newIdentifierType">Type</label>
                    <select
                        id="newIdentifierType"
                        className="rr-input"
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as AliasType)}
                    >
                        {ADDABLE_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {TYPE_LABELS[t]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="rr-field" style={{ flex: 1, marginBottom: 0 }}>
                    <label htmlFor="newIdentifierValue">Value</label>
                    <input
                        id="newIdentifierValue"
                        className="rr-input"
                        type="text"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                    />
                </div>
                <Button type="submit" variant="secondary" style={{ width: "auto" }} loading={adding} disabled={adding}>
                    Add
                </Button>
            </form>
        </div>
    );
}
