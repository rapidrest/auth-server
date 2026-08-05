import React, { useEffect, useState } from "react";
import { ApiRequestError, apiFetch, clearAuthToken } from "../_lib/api.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

interface Contact {
    contact: string;
    type: string;
    verified: boolean;
}

interface Profile {
    uid: string;
    givenName?: string;
    familyName?: string;
    birthdate?: string;
    // Gated behind the `profile:email` scope server-side — omitted entirely from the response (not just
    // empty) for a token that doesn't carry it, which this account's freshly-registered JWT doesn't yet.
    contacts?: Contact[];
}

export default function AccountPage({ userUid }: AccountPageProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userUid) {
            window.location.replace("/auth/signin");
            return;
        }
        apiFetch<Profile>(`/profiles/${userUid}`)
            .then(setProfile)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load your profile."));
    }, [userUid]);

    function handleLogout() {
        clearAuthToken();
        window.location.href = "/auth/signin";
    }

    if (!userUid) {
        return <div className="rr-page" />;
    }

    const email = profile?.contacts?.find((c) => c.type === "email")?.contact;
    const displayName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ") || email || "there";
    const initial = (profile?.givenName || email || "?").charAt(0).toUpperCase();

    return (
        <div className="rr-page">
            <div className="rr-container">
                <div className="rr-card">
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                        <div className="rr-avatar">{initial}</div>
                        <div>
                            <div className="rr-card__title" style={{ marginBottom: 0 }}>
                                Welcome, {displayName}
                            </div>
                            {email && (
                                <div className="rr-card__subtitle" style={{ marginBottom: 0 }}>
                                    {email}
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {error}
                        </div>
                    )}

                    <p className="rr-hint">
                        Profile editing and login method management (passkeys, authenticator apps, passwords) are coming soon.
                    </p>

                    <button className="rr-button rr-button--secondary" type="button" onClick={handleLogout}>
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
