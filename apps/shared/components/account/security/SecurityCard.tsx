import React, { useEffect, useState } from "react";
import { ApiRequestError, ApiUser, updateSelfUser } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface SecurityCardProps {
    user: ApiUser | null;
    setUser: (user: ApiUser) => void;
}

export default function SecurityCard({ user, setUser }: SecurityCardProps) {
    const [requireMFA, setRequireMFA] = useState(!!user?.requireMFA);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Reseed only when the account itself (re-)loads (mirrors UserOverviewCard's admin equivalent).
    useEffect(() => {
        setRequireMFA(!!user?.requireMFA);
        setSaved(false);
    }, [user?.uid]);

    if (!user) {
        return null;
    }
    const currentUser = user;

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateSelfUser({ uid: currentUser.uid, version: currentUser.version, requireMFA });
            setUser(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save your security settings.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Security</div>
            <p className="rr-card__subtitle">Multi-factor authentication.</p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="requireMFA" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="requireMFA"
                        type="checkbox"
                        checked={requireMFA}
                        onChange={(e) => {
                            setRequireMFA(e.target.checked);
                            setSaved(false);
                        }}
                    />
                    Require multi-factor authentication to sign in
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
