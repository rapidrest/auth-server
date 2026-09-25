///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import {
    Alias,
    ApiRequestError,
    ApiUser,
    getAccount,
    getCurrentUser,
    hasSecondFactor,
    logout,
    Profile,
    SecretSummary,
} from "../shared/lib/api.js";
import { PublicSiteSettings } from "../shared/lib/siteSettings.js";
import { useSessionRefresh } from "../shared/lib/useSessionRefresh.js";
import { isSafeReturnTo, readReturnTo } from "./auth/signin.js";
import AuthShell from "../shared/components/layout/AuthShell.js";
import AccountHeader from "../shared/components/account/header/AccountHeader.js";
import UsernameCard from "../shared/components/account/username/UsernameCard.js";
import ProfileCard from "../shared/components/account/profile/ProfileCard.js";
import ContactsCard from "../shared/components/account/contacts/ContactsCard.js";
import SecretsCard from "../shared/components/account/secrets/SecretsCard.js";
import ChangePasswordModal from "../shared/components/account/secrets/ChangePasswordModal.js";
import AppPasswordsCard from "../shared/components/account/app-passwords/AppPasswordsCard.js";
import SecurityCard from "../shared/components/account/security/SecurityCard.js";
import RequireMfaSetupModal from "../shared/components/account/security/RequireMfaSetupModal.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
    /** Populated automatically by the framework — the configured `app_url` (see `wwwRoute`'s `fetchProps()` override); empty/absent when none is configured. */
    appUrl?: string;
    /**
     * The origins a `return_to` URL may point at besides this one. Populated automatically by the framework - see
     * `wwwRoute`'s `fetchProps()` override. Absent means only same-origin paths are honored.
     */
    returnToOrigins?: string[];
}

export default function AccountPage({ userUid, siteSettings, appUrl, returnToOrigins = [] }: AccountPageProps) {
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

    async function handleForcedPasswordChanged(saved: SecretSummary) {
        // The dialog is only shown for a password found in `secrets`, so it has loaded — `prev` is never null here.
        setSecrets((prev) => prev!.map((s) => (s.uid === saved.uid ? saved : s)));
        // Changing the password cleared `passwordChangeRequired` server-side, which bumped the user's `version` —
        // re-read it, so a later self-service update (e.g. the requireMFA toggle) isn't rejected as stale.
        try {
            setUser(await getCurrentUser());
        } catch {
            // Likewise the dialog is only shown for a loaded `user` whose flag is set, so `prev` is never null.
            setUser((prev) => ({ ...prev!, passwordChangeRequired: false }));
        }

        // Sign-in sent them here, instead of where they were going, because the password had to be changed first
        // (see `completeSignIn()`). Now it has been, so carry on - if the destination is still a safe one.
        const returnTo = readReturnTo();
        if (returnTo && isSafeReturnTo(returnTo, returnToOrigins)) {
            window.location.href = returnTo;
        }
    }

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
        <AuthShell wide largeHeaderLogo settings={siteSettings}>
            <AccountHeader
                profile={profile}
                onLogout={handleLogout}
                onAccountDeleted={handleAccountDeleted}
                isAdmin={isAdmin}
                appUrl={appUrl}
            />

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

            <AppPasswordsCard secrets={secrets} secretsError={accountError} setSecrets={setSecrets} />

            <SecurityCard user={user} setUser={setUser} />

            <RequireMfaSetupModal
                open={!!user?.requireMFA && !hasSecondFactor(secrets, aliases)}
                setSecrets={setSecrets}
            />

            {/* Mandatory, like the prompt above: `onClose` is a no-op, so it only goes away once the password is
                actually changed (which clears `passwordChangeRequired` server-side, and here via `handleForcedPasswordChanged`). */}
            <ChangePasswordModal
                secret={user?.passwordChangeRequired ? (secrets?.find((s) => s.type === "password") ?? null) : null}
                onClose={() => undefined}
                onSaved={handleForcedPasswordChanged}
                onSignOut={handleLogout}
                notice="An administrator set a temporary password for this account. Choose a new one to continue."
            />
        </AuthShell>
    );
}
