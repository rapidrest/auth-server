import React, { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { ApiRequestError, createProfile, Profile, updateProfile } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface ProfileCardProps {
    profile: Profile | null;
    profileExists: boolean;
    /** True once the *initial* `getProfile()` load has settled (success or 404-caught) — see below. */
    profileLoaded: boolean;
    loadError: string | null;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    setProfileExists: Dispatch<SetStateAction<boolean>>;
}

/**
 * `Profile.birthdate` round-trips through the server as a full `Date`/timestamp, not a bare calendar
 * date — a create with `"1990-01-01"` comes back from a later `GET` as e.g.
 * `"1990-01-01T08:00:00.000Z"`. A native `<input type="date">` only accepts an exact `YYYY-MM-DD`
 * value and silently renders empty (not an error) for anything else, so the saved birthdate would
 * appear to have vanished after a reload. Slicing to the date portion of the (UTC) ISO string is safe
 * here since that's exactly the calendar date the string already encodes.
 */
function toDateInputValue(value: string | undefined): string {
    return value ? value.slice(0, 10) : "";
}

export default function ProfileCard({
    profile,
    profileExists,
    profileLoaded,
    loadError,
    setProfile,
    setProfileExists,
}: ProfileCardProps) {
    const [givenName, setGivenName] = useState("");
    const [familyName, setFamilyName] = useState("");
    const [birthdate, setBirthdate] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileSaved, setProfileSaved] = useState(false);

    // Seed the form from the *initial* load only — never again, not even after a successful save
    // (which returns a fresh `profile` object but shouldn't stomp on fields the user already edited).
    // `profileLoaded` flips from false to true exactly once, so this effect only ever fires once.
    useEffect(() => {
        if (profileLoaded) {
            setGivenName(profile?.givenName ?? "");
            setFamilyName(profile?.familyName ?? "");
            setBirthdate(toDateInputValue(profile?.birthdate));
        }
    }, [profileLoaded]);

    async function handleProfileSubmit(e: FormEvent) {
        e.preventDefault();
        setProfileError(null);
        setProfileSaved(false);
        setProfileSaving(true);
        try {
            const input = {
                givenName: givenName.trim() || undefined,
                familyName: familyName.trim() || undefined,
                birthdate: birthdate || undefined,
            };
            if (profileExists && profile) {
                const updated = await updateProfile({ uid: profile.uid, version: profile.version, ...input });
                setProfile(updated);
            } else {
                const created = (await createProfile(input)) as Profile;
                setProfile(created);
                setProfileExists(true);
            }
            setProfileSaved(true);
        } catch (err) {
            setProfileError(err instanceof ApiRequestError ? err.message : "Could not save your profile.");
        } finally {
            setProfileSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Profile</div>
            <p className="rr-card__subtitle">Your name and birthdate.</p>
            {(loadError || profileError) && <Alert>{loadError || profileError}</Alert>}
            <form onSubmit={handleProfileSubmit}>
                <FormField label="Given name" htmlFor="givenName">
                    <input
                        id="givenName"
                        className="rr-input"
                        type="text"
                        autoComplete="given-name"
                        value={givenName}
                        onChange={(e) => {
                            setGivenName(e.target.value);
                            setProfileSaved(false);
                        }}
                    />
                </FormField>
                <FormField label="Family name" htmlFor="familyName">
                    <input
                        id="familyName"
                        className="rr-input"
                        type="text"
                        autoComplete="family-name"
                        value={familyName}
                        onChange={(e) => {
                            setFamilyName(e.target.value);
                            setProfileSaved(false);
                        }}
                    />
                </FormField>
                <FormField label="Birthdate" htmlFor="birthdate">
                    <input
                        id="birthdate"
                        className="rr-input"
                        type="date"
                        autoComplete="bday"
                        value={birthdate}
                        onChange={(e) => {
                            setBirthdate(e.target.value);
                            setProfileSaved(false);
                        }}
                    />
                </FormField>
                <Button type="submit" loading={profileSaving} disabled={profileSaving} style={{ width: "auto" }}>
                    Save profile
                </Button>
                {profileSaved && (
                    <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                        Saved.
                    </span>
                )}
            </form>
        </div>
    );
}
