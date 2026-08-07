import React, { FormEvent, useState } from "react";
import { AliasType, ApiRequestError } from "../../../lib/api.js";
import { createUser, createUserAlias, createUserPasswordSecret } from "../../../lib/adminApi.js";
import { isPasswordValid, usePasswordRequirements } from "../../../lib/passwordCriteria.js";
import Alert from "../../feedback/Alert.js";
import PasswordFieldset from "../../forms/PasswordFieldset.js";
import Button from "../../buttons/Button.js";
import RoleScopeEditor from "./RoleScopeEditor.js";

export interface CreateUserFormProps {
    onCreated: (uid: string) => void;
}

const IDENTIFIER_TYPES: { value: AliasType; label: string }[] = [
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "name", label: "Username" },
];

export default function CreateUserForm({ onCreated }: CreateUserFormProps) {
    const { criteria } = usePasswordRequirements();

    const [identifierType, setIdentifierType] = useState<AliasType>("email");
    const [identifierValue, setIdentifierValue] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [roles, setRoles] = useState<string[]>([]);
    const [scopes, setScopes] = useState<string[]>([]);
    const [verified, setVerified] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const passwordProvided = password.length > 0 || confirmPassword.length > 0;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!identifierValue.trim()) {
            setError("An identifier (email, phone, or username) is required.");
            return;
        }
        if (passwordProvided) {
            if (!isPasswordValid(password, criteria)) {
                setError("Password does not meet the requirements below.");
                return;
            }
            if (password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
            }
        }

        setSaving(true);
        try {
            // Provisioning a full account is 2-3 non-atomic requests (User, then its identifier, then an
            // optional credential) — the underlying REST resources are separate and there's no transaction
            // spanning them. If a later step fails (e.g. the identifier is already taken), the User record
            // still exists; the admin can finish setup from the account's detail page.
            const user = await createUser({ roles, scopes, verified });
            await createUserAlias(user.uid, identifierType, identifierValue.trim());
            if (passwordProvided) {
                await createUserPasswordSecret(user.uid, password, "Set by administrator");
            }
            onCreated(user.uid);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not create the account.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}

            <div style={{ display: "flex", gap: "0.75rem" }}>
                <div className="rr-field" style={{ flex: "0 0 140px" }}>
                    <label htmlFor="newUserIdentifierType">Identifier type</label>
                    <select
                        id="newUserIdentifierType"
                        className="rr-input"
                        value={identifierType}
                        onChange={(e) => setIdentifierType(e.target.value as AliasType)}
                    >
                        {IDENTIFIER_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="rr-field" style={{ flex: 1 }}>
                    <label htmlFor="newUserIdentifierValue">Identifier</label>
                    <input
                        id="newUserIdentifierValue"
                        className="rr-input"
                        type="text"
                        value={identifierValue}
                        onChange={(e) => setIdentifierValue(e.target.value)}
                    />
                </div>
            </div>

            <PasswordFieldset
                id="newUserPassword"
                label="Temporary password (optional)"
                confirmId="newUserConfirmPassword"
                confirmLabel="Confirm temporary password"
                value={password}
                onChange={setPassword}
                confirmValue={confirmPassword}
                onConfirmChange={setConfirmPassword}
                criteria={criteria}
                emptyHint="Leave blank to require the account holder to set their own password later."
                showConfirmWhenEmpty={false}
            />

            <RoleScopeEditor id="newUserRoles" label="Roles" values={roles} onChange={setRoles} placeholder="e.g. admin" />
            <RoleScopeEditor id="newUserScopes" label="Scopes" values={scopes} onChange={setScopes} placeholder="e.g. profile:contacts" />

            <div className="rr-field">
                <label htmlFor="newUserVerified" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="newUserVerified"
                        type="checkbox"
                        checked={verified}
                        onChange={(e) => setVerified(e.target.checked)}
                    />
                    Verified
                </label>
            </div>

            <Button type="submit" style={{ width: "auto" }} loading={saving} disabled={saving}>
                Create account
            </Button>
        </form>
    );
}
