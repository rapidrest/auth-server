///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { Alias, ApiRequestError, ApiUser, getAccount, hasSecondFactor, logout, Profile, SecretSummary } from "../shared/lib/api.js";
import { PublicSiteSettings } from "../shared/lib/siteSettings.js";
import { useSessionRefresh } from "../shared/lib/useSessionRefresh.js";
import AuthShell from "../shared/components/layout/AuthShell.js";
import AccountHeader from "../shared/components/account/header/AccountHeader.js";
import UsernameCard from "../shared/components/account/username/UsernameCard.js";
import ProfileCard from "../shared/components/account/profile/ProfileCard.js";
import ContactsCard from "../shared/components/account/contacts/ContactsCard.js";
import SecretsCard from "../shared/components/account/secrets/SecretsCard.js";
import SecurityCard from "../shared/components/account/security/SecurityCard.js";
import RequireMfaSetupModal from "../shared/components/account/security/RequireMfaSetupModal.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function AccountPage({ userUid, siteSettings }: AccountPageProps) {
    const [user, setUser] = useState<ApiUser | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileExists, setProfileExists] = useState(false);
    // Flips true once the initial getAccount() load settles (success or failure) — see ProfileCard,
    // which uses this (rather than `profile` itself) to seed its editable fields exactly once.
    const [profileLoaded, setProfileLoaded] = useState(false);

    const [aliases, setAliases] = useState<Alias[] | null>(null);
    const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
    // A single request now backs profile/aliases/secrets together (GET /accounts/me), so a failure is
    // reported in all three places at once rather than tracked as three independent error states.
    const [accountError, setAccountError] = useState<string | null>(null);

    const [isAdmin, setIsAdmin] = useState(false);

    // Keeps the access token alive (and this page usable) for as long as the refresh token is valid —
    // see useSessionRefresh's doc comment. Handles redirecting to sign-in itself when no session can be
    // recovered, so the effect below no longer needs to.
    useSessionRefresh(userUid);

    useEffect(() => {
        if (!userUid) {
            return;
        }

        getAccount("me")
            .then((data) => {
                setUser(data.user);
                setIsAdmin(!!data.user.roles?.includes("admin"));
                setProfile(data.profile ?? null);
                setProfileExists(!!data.profile);
                setAliases(data.aliases);
                setSecrets(data.secrets);
                // Set together with the branch above (rather than in a trailing .finally()) so
                // `profileLoaded` lands in the same batched update as `profile`/`profileExists` — a
                // .finally() runs in its own later microtask, which let ProfileCard's seed effect
                // (keyed on `profileLoaded`) fire a render behind AccountHeader's under load.
                setProfileLoaded(true);
            })
            .catch((err) => {
                setAccountError(err instanceof ApiRequestError ? err.message : "Could not load your account.");
                setProfileLoaded(true);
            });
    }, [userUid]);

    async function handleLogout() {
        await logout();
        window.location.href = "/auth/signin";
    }

    async function handleAccountDeleted() {
        // The account (and its JWT-bearing User record) is already gone server-side — still run the
        // normal logout flow to clear local/cookie auth state, same as handleLogout above.
        await logout();
        window.location.href = "/auth/signin";
    }

    if (!userUid) {
        return <div className="rr-page" />;
    }

    return (
        <AuthShell wide settings={siteSettings}>
            <AccountHeader profile={profile} onLogout={handleLogout} onAccountDeleted={handleAccountDeleted} isAdmin={isAdmin} />

            <UsernameCard aliases={aliases} setAliases={setAliases} />

            <ProfileCard
                profile={profile}
                profileExists={profileExists}
                profileLoaded={profileLoaded}
                loadError={accountError}
                setProfile={setProfile}
                setProfileExists={setProfileExists}
            />

            <ContactsCard
                profile={profile}
                profileExists={profileExists}
                aliases={aliases}
                aliasError={accountError}
                setProfile={setProfile}
                setProfileExists={setProfileExists}
                setAliases={setAliases}
            />

            <SecretsCard userUid={userUid} secrets={secrets} secretsError={accountError} setSecrets={setSecrets} />

            <SecurityCard user={user} setUser={setUser} />

            <RequireMfaSetupModal
                open={!!user?.requireMFA && !hasSecondFactor(secrets, aliases)}
                setSecrets={setSecrets}
            />
        </AuthShell>
    );
}
