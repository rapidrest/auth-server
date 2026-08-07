import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../../lib/api.js";
import { AdminUser, updateUser } from "../../../../lib/adminApi.js";
import Alert from "../../../feedback/Alert.js";
import Button from "../../../buttons/Button.js";
import RoleScopeEditor from "../RoleScopeEditor.js";

export interface UserOverviewCardProps {
    user: AdminUser;
    onUpdated: (user: AdminUser) => void;
}

function formatDateTime(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function UserOverviewCard({ user, onUpdated }: UserOverviewCardProps) {
    const [roles, setRoles] = useState<string[]>(user.roles ?? []);
    const [scopes, setScopes] = useState<string[]>(user.scopes ?? []);
    const [verified, setVerified] = useState(!!user.verified);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Reseed only when a *different* account is loaded (this card is only ever rendered once its parent
    // page has finished loading `user`, so there's no "loading" state to key off, unlike ProfileCard).
    useEffect(() => {
        setRoles(user.roles ?? []);
        setScopes(user.scopes ?? []);
        setVerified(!!user.verified);
        setSaved(false);
    }, [user.uid]);

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateUser({ uid: user.uid, version: user.version, roles, scopes, verified });
            onUpdated(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this account.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Overview</div>
            <p className="rr-card__subtitle">Roles, scopes, and account status.</p>
            {error && <Alert>{error}</Alert>}

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 1rem", marginBottom: "1rem" }}>
                <dt className="rr-hint">UID</dt>
                <dd style={{ fontFamily: "monospace" }}>{user.uid}</dd>
                <dt className="rr-hint">Created</dt>
                <dd>{formatDateTime(user.dateCreated)}</dd>
                <dt className="rr-hint">Modified</dt>
                <dd>{formatDateTime(user.dateModified)}</dd>
            </dl>

            <RoleScopeEditor id="overviewRoles" label="Roles" values={roles} onChange={setRoles} placeholder="e.g. admin" />
            <RoleScopeEditor id="overviewScopes" label="Scopes" values={scopes} onChange={setScopes} placeholder="e.g. profile:contacts" />

            <div className="rr-field">
                <label htmlFor="overviewVerified" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="overviewVerified"
                        type="checkbox"
                        checked={verified}
                        onChange={(e) => {
                            setVerified(e.target.checked);
                            setSaved(false);
                        }}
                    />
                    Verified
                </label>
            </div>

            <Button type="button" onClick={handleSave} loading={saving} disabled={saving} style={{ width: "auto" }}>
                Save
            </Button>
            {saved && (
                <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                    Saved.
                </span>
            )}
        </div>
    );
}
