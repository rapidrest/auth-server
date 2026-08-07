import React, { useEffect, useState } from "react";
import { Alias, ApiRequestError, getCurrentUser, getProfile, listAliases, logout, Profile } from "../../shared/lib/api.js";
import AuthShell from "../../shared/components/layout/AuthShell.js";
import AccountHeader from "../../shared/components/account/header/AccountHeader.js";
import UsernameCard from "../../shared/components/account/username/UsernameCard.js";
import ProfileCard from "../../shared/components/account/profile/ProfileCard.js";
import ContactsCard from "../../shared/components/account/contacts/ContactsCard.js";
import SecretsCard from "../../shared/components/account/secrets/SecretsCard.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function AccountPage({ userUid }: AccountPageProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileExists, setProfileExists] = useState(false);
    // Flips true once the initial getProfile() load settles (success or 404-caught) — see ProfileCard,
    // which uses this (rather than `profile` itself) to seed its editable fields exactly once.
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [aliases, setAliases] = useState<Alias[] | null>(null);
    const [aliasError, setAliasError] = useState<string | null>(null);

    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (!userUid) {
            window.location.replace("/auth/signin");
            return;
        }

        // Purely cosmetic (shows/hides the "Admin console" link) — the admin console itself re-checks the
        // caller's role server-side, so a failure here just means the link doesn't appear, nothing unsafe.
        getCurrentUser()
            .then((u) => setIsAdmin(!!u.roles?.includes("admin")))
            .catch(() => {
                // Leave isAdmin false — see comment above.
            });

        getProfile()
            .then((p) => {
                setProfile(p);
                setProfileExists(true);
                setProfileLoaded(true);
            })
            .catch((err) => {
                // No Profile exists yet for a freshly-registered account — that's expected, not an error.
                if (!(err instanceof ApiRequestError && err.status === 404)) {
                    setProfileError(err instanceof ApiRequestError ? err.message : "Could not load your profile.");
                }
                // Set together with the branch above (rather than in a trailing .finally()) so
                // `profileLoaded` lands in the same batched update as `profile`/`profileExists` — a
                // .finally() runs in its own later microtask, which let ProfileCard's seed effect
                // (keyed on `profileLoaded`) fire a render behind AccountHeader's under load.
                setProfileLoaded(true);
            });

        listAliases()
            .then(setAliases)
            .catch((err) => setAliasError(err instanceof ApiRequestError ? err.message : "Could not load your aliases."));
    }, [userUid]);

    async function handleLogout() {
        await logout();
        window.location.href = "/auth/signin";
    }

    if (!userUid) {
        return <div className="rr-page" />;
    }

    return (
        <AuthShell wide>
            <AccountHeader profile={profile} onLogout={handleLogout} isAdmin={isAdmin} />

            <UsernameCard aliases={aliases} setAliases={setAliases} />

            <ProfileCard
                profile={profile}
                profileExists={profileExists}
                profileLoaded={profileLoaded}
                loadError={profileError}
                setProfile={setProfile}
                setProfileExists={setProfileExists}
            />

            <ContactsCard
                profile={profile}
                profileExists={profileExists}
                aliases={aliases}
                aliasError={aliasError}
                setProfile={setProfile}
                setProfileExists={setProfileExists}
                setAliases={setAliases}
            />

            <SecretsCard />
        </AuthShell>
    );
}
