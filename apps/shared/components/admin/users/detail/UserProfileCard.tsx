import React, { FormEvent, useEffect, useState } from "react";
import { ApiRequestError, Profile } from "../../../../lib/api.js";
import { getUserProfile, upsertUserProfile } from "../../../../lib/adminApi.js";
import Alert from "../../../feedback/Alert.js";
import FormField from "../../../forms/FormField.js";
import Button from "../../../buttons/Button.js";

export interface UserProfileCardProps {
    uid: string;
}

/** See `ProfileCard`'s identical helper: `birthdate` round-trips as a full timestamp, not a bare date. */
function toDateInputValue(value: string | undefined): string {
    return value ? value.slice(0, 10) : "";
}

export default function UserProfileCard({ uid }: UserProfileCardProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [givenName, setGivenName] = useState("");
    const [familyName, setFamilyName] = useState("");
    const [birthdate, setBirthdate] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getUserProfile(uid)
            .then((p) => {
                setProfile(p);
                setGivenName(p?.givenName ?? "");
                setFamilyName(p?.familyName ?? "");
                setBirthdate(toDateInputValue(p?.birthdate));
            })
            .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : "Could not load this account's profile."))
            .finally(() => setLoaded(true));
    }, [uid]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const input = {
                givenName: givenName.trim() || undefined,
                familyName: familyName.trim() || undefined,
                birthdate: birthdate || undefined,
            };
            const updated = await upsertUserProfile(uid, input, profile);
            setProfile(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this account's profile.");
        } finally {
            setSaving(false);
        }
    }

    if (!loaded) {
        return null;
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Profile</div>
            <p className="rr-card__subtitle">Given name, family name, and birthdate.</p>
            {(loadError || error) && <Alert>{loadError || error}</Alert>}
            <form onSubmit={handleSubmit}>
                <FormField label="Given name" htmlFor="adminGivenName">
                    <input
                        id="adminGivenName"
                        className="rr-input"
                        type="text"
                        value={givenName}
                        onChange={(e) => {
                            setGivenName(e.target.value);
                            setSaved(false);
                        }}
                    />
                </FormField>
                <FormField label="Family name" htmlFor="adminFamilyName">
                    <input
                        id="adminFamilyName"
                        className="rr-input"
                        type="text"
                        value={familyName}
                        onChange={(e) => {
                            setFamilyName(e.target.value);
                            setSaved(false);
                        }}
                    />
                </FormField>
                <FormField label="Birthdate" htmlFor="adminBirthdate">
                    <input
                        id="adminBirthdate"
                        className="rr-input"
                        type="date"
                        value={birthdate}
                        onChange={(e) => {
                            setBirthdate(e.target.value);
                            setSaved(false);
                        }}
                    />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving} style={{ width: "auto" }}>
                    Save profile
                </Button>
                {saved && (
                    <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                        Saved.
                    </span>
                )}
            </form>
        </div>
    );
}
