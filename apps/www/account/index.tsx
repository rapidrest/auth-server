import React, { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import {
    Alias,
    ApiRequestError,
    Contact,
    RegistrationIdentifierType,
    SecretType,
    logout,
    createAlias,
    createPasswordSecret,
    createProfile,
    createTotpSecret,
    createUsernameAlias,
    deleteAlias,
    deleteSecret,
    getFido2RegistrationOptions,
    getPasskeyRegistrationOptions,
    getPasswordRequirements,
    getProfile,
    listAliases,
    listSecrets,
    Profile,
    registerFido2,
    registerPasskey,
    resendContactVerificationCode,
    SecretSummary,
    updateProfile,
    updateUsernameAlias,
    verifyContact,
} from "../_lib/api.js";
import {
    buildPasswordCriteria,
    FALLBACK_PASSWORD_REQUIREMENTS,
    isPasswordValid,
    PasswordCriteriaList,
} from "../_lib/passwordCriteria.js";
import Modal from "../_lib/Modal.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

const CONTACT_TYPE_LABELS: Record<RegistrationIdentifierType, string> = {
    email: "E-mail",
    phone: "Phone",
};

const SECRET_TYPE_LABELS: Record<SecretType, string> = {
    password: "Password",
    totp: "Authenticator app",
    passkey: "Passkey",
    fido2: "Security key",
};

type AddMethodType = SecretType | null;

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

function formatDate(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return iso;
    }
}

/** Finds the sign-in alias (if any) matching a contact, so the Contacts table can show its enabled state. */
function findAliasForContact(aliases: Alias[] | null, contact: Contact): Alias | undefined {
    return aliases?.find((a) => a.type === contact.type && a.alias === contact.contact);
}

export default function AccountPage({ userUid }: AccountPageProps) {
    // --- Profile ---
    const [profile, setProfile] = useState<Profile | null>(null);
    const [profileExists, setProfileExists] = useState(false);
    const [givenName, setGivenName] = useState("");
    const [familyName, setFamilyName] = useState("");
    const [birthdate, setBirthdate] = useState("");
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profileSaved, setProfileSaved] = useState(false);

    // --- Aliases (backs both the username box and the Contacts table's sign-in toggle) ---
    const [aliases, setAliases] = useState<Alias[] | null>(null);
    const [aliasError, setAliasError] = useState<string | null>(null);

    // --- Username ---
    const usernameAlias = useMemo(() => aliases?.find((a) => a.type === "name"), [aliases]);
    const [usernameValue, setUsernameValue] = useState("");
    const [usernameSaving, setUsernameSaving] = useState(false);
    const [usernameError, setUsernameError] = useState<string | null>(null);
    const [usernameModalOpen, setUsernameModalOpen] = useState(false);

    // --- Contacts ---
    const contacts = profile?.contacts ?? [];
    const [contactsError, setContactsError] = useState<string | null>(null);
    const [addContactModalOpen, setAddContactModalOpen] = useState(false);
    const [addContactError, setAddContactError] = useState<string | null>(null);
    const [newContactType, setNewContactType] = useState<RegistrationIdentifierType>("email");
    const [newContactValue, setNewContactValue] = useState("");
    const [contactAdding, setContactAdding] = useState(false);
    // An account must always retain at least one verified contact and at least one enabled sign-in alias —
    // both counts gate the Contacts table's Remove/Disable actions below.
    const verifiedContactCount = contacts.filter((c) => c.verified).length;
    const enabledAliasCount = (aliases ?? []).filter((a) => a.type === "email" || a.type === "phone").length;

    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifyingContact, setVerifyingContact] = useState<Contact | null>(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [verifySaving, setVerifySaving] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    // --- Secrets (password / totp / passkey / fido2) ---
    const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
    const [secretError, setSecretError] = useState<string | null>(null);

    const [passwordRequirements, setPasswordRequirements] = useState(FALLBACK_PASSWORD_REQUIREMENTS);
    const passwordCriteria = useMemo(() => buildPasswordCriteria(passwordRequirements), [passwordRequirements]);

    const [addMethodModalOpen, setAddMethodModalOpen] = useState(false);
    const [addMethodType, setAddMethodType] = useState<AddMethodType>(null);
    // Shared across all four add-method forms below — only one is ever active at a time, and it's reset
    // whenever the modal closes (see closeAddMethodModal()).
    const [methodHint, setMethodHint] = useState("");

    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const [totpAdding, setTotpAdding] = useState(false);
    const [totpError, setTotpError] = useState<string | null>(null);
    const [totpSetup, setTotpSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);

    const [passkeyAdding, setPasskeyAdding] = useState(false);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);

    const [fido2Adding, setFido2Adding] = useState(false);
    const [fido2Error, setFido2Error] = useState<string | null>(null);

    useEffect(() => {
        if (!userUid) {
            window.location.replace("/auth/signin");
            return;
        }

        getProfile()
            .then((p) => {
                setProfile(p);
                setProfileExists(true);
                setGivenName(p.givenName ?? "");
                setFamilyName(p.familyName ?? "");
                setBirthdate(toDateInputValue(p.birthdate));
            })
            .catch((err) => {
                // No Profile exists yet for a freshly-registered account — that's expected, not an error.
                if (!(err instanceof ApiRequestError && err.status === 404)) {
                    setProfileError(err instanceof ApiRequestError ? err.message : "Could not load your profile.");
                }
            });

        listAliases()
            .then(setAliases)
            .catch((err) => setAliasError(err instanceof ApiRequestError ? err.message : "Could not load your aliases."));

        listSecrets()
            .then(setSecrets)
            .catch((err) => setSecretError(err instanceof ApiRequestError ? err.message : "Could not load your sign-in methods."));

        getPasswordRequirements()
            .then(setPasswordRequirements)
            .catch(() => {
                // Keep the fallback defaults — the server is still the source of truth at submit time.
            });
    }, [userUid]);

    async function handleLogout() {
        await logout();
        window.location.href = "/auth/signin";
    }

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

    // --- Username ---

    async function handleAddUsername(e: FormEvent) {
        e.preventDefault();
        setUsernameError(null);
        setUsernameSaving(true);
        try {
            const created = await createUsernameAlias(usernameValue.trim());
            setAliases((prev) => [...(prev ?? []), created]);
            setUsernameValue("");
        } catch (err) {
            setUsernameError(err instanceof ApiRequestError ? err.message : "Could not save that username.");
        } finally {
            setUsernameSaving(false);
        }
    }

    function openChangeUsernameModal() {
        // Only reachable via the "Change" button, which only renders once `usernameAlias` exists.
        setUsernameValue(usernameAlias!.alias);
        setUsernameError(null);
        setUsernameModalOpen(true);
    }

    function closeChangeUsernameModal() {
        setUsernameModalOpen(false);
        setUsernameError(null);
        setUsernameValue("");
    }

    async function handleChangeUsername(e: FormEvent) {
        e.preventDefault();
        // Only reachable via the modal opened by openChangeUsernameModal(), which requires `usernameAlias`
        // — and therefore an already-loaded, non-null `aliases` — to exist in the first place.
        const oldAlias = usernameAlias!;
        setUsernameError(null);
        setUsernameSaving(true);
        try {
            const created = await updateUsernameAlias(oldAlias.uid, usernameValue.trim());
            setAliases((prev) => [...prev!.filter((a) => a.uid !== oldAlias.uid), created]);
            closeChangeUsernameModal();
        } catch (err) {
            setUsernameError(err instanceof ApiRequestError ? err.message : "Could not change your username.");
        } finally {
            setUsernameSaving(false);
        }
    }

    // --- Contacts ---

    async function saveContacts(nextContacts: Contact[]): Promise<Profile> {
        if (profileExists && profile) {
            const updated = await updateProfile({ uid: profile.uid, version: profile.version, contacts: nextContacts });
            setProfile(updated);
            return updated;
        }
        const created = (await createProfile({ contacts: nextContacts })) as Profile;
        setProfile(created);
        setProfileExists(true);
        return created;
    }

    function openAddContactModal() {
        setNewContactType("email");
        setNewContactValue("");
        setAddContactError(null);
        setAddContactModalOpen(true);
    }

    function closeAddContactModal() {
        setAddContactModalOpen(false);
        setNewContactType("email");
        setNewContactValue("");
        setAddContactError(null);
    }

    async function handleAddContact(e: FormEvent) {
        e.preventDefault();
        setAddContactError(null);
        setContactAdding(true);
        const contact: Contact = { contact: newContactValue.trim(), type: newContactType, verified: false };
        try {
            await saveContacts([...contacts, contact]);
            closeAddContactModal();
            // The server auto-sends a verification code as a side effect of adding a genuinely new,
            // unverified contact — prompt for it immediately rather than making the user hunt for a
            // separate "verify" action.
            setVerifyingContact(contact);
            setVerifyCode("");
            setVerifyError(null);
            setResent(false);
            setVerifyModalOpen(true);
        } catch (err) {
            setAddContactError(err instanceof ApiRequestError ? err.message : "Could not add that contact.");
        } finally {
            setContactAdding(false);
        }
    }

    function openVerifyModal(contact: Contact) {
        setVerifyingContact(contact);
        setVerifyCode("");
        setVerifyError(null);
        setResent(false);
        setVerifyModalOpen(true);
    }

    function closeVerifyModal() {
        setVerifyModalOpen(false);
        setVerifyingContact(null);
        setVerifyCode("");
        setVerifyError(null);
        setResent(false);
    }

    async function handleVerifyContact(e: FormEvent) {
        e.preventDefault();
        // Only reachable while the verify modal is open, which always sets `verifyingContact` first.
        setVerifyError(null);
        setVerifySaving(true);
        try {
            const updated = await verifyContact(verifyingContact!.contact, verifyCode.trim());
            setProfile(updated);
            closeVerifyModal();
        } catch (err) {
            setVerifyError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
        } finally {
            setVerifySaving(false);
        }
    }

    async function handleResendCode() {
        setVerifyError(null);
        setResent(false);
        setResending(true);
        try {
            await resendContactVerificationCode(verifyingContact!.contact);
            setResent(true);
        } catch (err) {
            setVerifyError(err instanceof ApiRequestError ? err.message : "Could not resend the code.");
        } finally {
            setResending(false);
        }
    }

    async function handleToggleContactSignIn(contact: Contact) {
        setContactsError(null);
        const existingAlias = findAliasForContact(aliases, contact);
        try {
            if (existingAlias) {
                // findAliasForContact() only found a match because `aliases` is already a loaded, non-null
                // array — so `prev` here is guaranteed non-null too.
                await deleteAlias(existingAlias.uid);
                setAliases((prev) => prev!.filter((a) => a.uid !== existingAlias.uid));
            } else {
                const created = await createAlias(contact.type, contact.contact, true);
                setAliases((prev) => [...(prev ?? []), created]);
            }
        } catch (err) {
            setContactsError(err instanceof ApiRequestError ? err.message : "Could not update that contact's sign-in setting.");
        }
    }

    async function handleRemoveContact(contact: Contact) {
        if (!window.confirm(`Remove ${contact.contact}? You will no longer be able to use it to sign in.`)) {
            return;
        }
        setContactsError(null);
        const existingAlias = findAliasForContact(aliases, contact);
        try {
            await saveContacts(contacts.filter((c) => !(c.contact === contact.contact && c.type === contact.type)));
            if (existingAlias) {
                // Same reasoning as handleToggleContactSignIn: a match means `aliases` is already loaded.
                await deleteAlias(existingAlias.uid);
                setAliases((prev) => prev!.filter((a) => a.uid !== existingAlias.uid));
            }
        } catch (err) {
            setContactsError(err instanceof ApiRequestError ? err.message : "Could not remove that contact.");
        }
    }

    async function handleDeleteSecret(uid: string, label: string) {
        if (!window.confirm(`Remove ${label}? You will no longer be able to use it to sign in.`)) {
            return;
        }
        setSecretError(null);
        try {
            await deleteSecret(uid);
            // Reachable only via a row's own "Remove" button, which only exists once `secrets` has
            // already loaded — `prev` is never null here.
            setSecrets((prev) => prev!.filter((s) => s.uid !== uid));
        } catch (err) {
            setSecretError(err instanceof ApiRequestError ? err.message : "Could not remove that sign-in method.");
        }
    }

    // --- Sign-in methods ---

    function closeAddMethodModal() {
        setAddMethodModalOpen(false);
        setAddMethodType(null);
        setMethodHint("");
        setNewPassword("");
        setConfirmNewPassword("");
        setPasswordError(null);
        setTotpError(null);
        setTotpSetup(null);
        setPasskeyError(null);
        setFido2Error(null);
    }

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setPasswordError(null);

        if (!isPasswordValid(newPassword, passwordCriteria)) {
            setPasswordError("Password does not meet the requirements below.");
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setPasswordError("Passwords do not match.");
            return;
        }

        setPasswordSaving(true);
        try {
            const created = (await createPasswordSecret(newPassword, methodHint.trim() || undefined)) as SecretSummary;
            // Secrets have no update endpoint — "changing" a password means creating the new one, then
            // removing any old password secret(s), as two separate (non-atomic) requests.
            const oldPasswords = (secrets ?? []).filter((s) => s.type === "password");
            for (const old of oldPasswords) {
                await deleteSecret(old.uid);
            }
            setSecrets((prev) => [...(prev ?? []).filter((s) => s.type !== "password"), created]);
            closeAddMethodModal();
        } catch (err) {
            setPasswordError(err instanceof ApiRequestError ? err.message : "Could not save your password.");
        } finally {
            setPasswordSaving(false);
        }
    }

    async function handleAddTotp(e: FormEvent) {
        e.preventDefault();
        setTotpError(null);
        setTotpAdding(true);
        try {
            const created = await createTotpSecret(methodHint.trim() || undefined);
            const qrDataUrl = await QRCode.toDataURL(created.data.uri, { width: 220, margin: 1 });
            setTotpSetup({ secret: created.data.secret, qrDataUrl });
            setSecrets((prev) => [...(prev ?? []), created]);
        } catch (err) {
            setTotpError(err instanceof ApiRequestError ? err.message : "Could not add an authenticator app.");
        } finally {
            setTotpAdding(false);
        }
    }

    async function handleAddPasskey(e: FormEvent) {
        e.preventDefault();
        setPasskeyError(null);
        setPasskeyAdding(true);
        try {
            const optionsJSON = (await getPasskeyRegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerPasskey(response, methodHint.trim() || undefined);
            setSecrets((prev) => [...(prev ?? []), created]);
            closeAddMethodModal();
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setPasskeyError("Passkey setup was cancelled.");
            } else {
                setPasskeyError(err instanceof ApiRequestError ? err.message : "Could not add a passkey.");
            }
        } finally {
            setPasskeyAdding(false);
        }
    }

    async function handleAddFido2(e: FormEvent) {
        e.preventDefault();
        setFido2Error(null);
        setFido2Adding(true);
        try {
            const optionsJSON = (await getFido2RegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerFido2(response, methodHint.trim() || undefined);
            setSecrets((prev) => [...(prev ?? []), created]);
            closeAddMethodModal();
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setFido2Error("Security key setup was cancelled.");
            } else {
                setFido2Error(err instanceof ApiRequestError ? err.message : "Could not add a security key.");
            }
        } finally {
            setFido2Adding(false);
        }
    }

    if (!userUid) {
        return <div className="rr-page" />;
    }

    const email = profile?.contacts?.find((c) => c.type === "email")?.contact;
    const displayName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ") || email || "there";
    const initial = (profile?.givenName || email || "?").charAt(0).toUpperCase();

    return (
        <div className="rr-page">
            <div className="rr-container rr-container--wide">
                <div className="rr-card">
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
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
                    <button className="rr-button rr-button--secondary" type="button" onClick={handleLogout}>
                        Log out
                    </button>
                </div>

                <div className="rr-card">
                    <div className="rr-card__title">Username</div>
                    <p className="rr-card__subtitle">A unique name you can use to sign in instead of an e-mail or phone.</p>
                    {usernameError && !usernameModalOpen && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {usernameError}
                        </div>
                    )}
                    {usernameAlias ? (
                        <div className="rr-list-row">
                            <div>{usernameAlias.alias}</div>
                            <button type="button" className="rr-button--text" onClick={openChangeUsernameModal}>
                                Change
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleAddUsername} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                            <input
                                className="rr-input"
                                type="text"
                                required
                                placeholder="username"
                                value={usernameValue}
                                onChange={(e) => setUsernameValue(e.target.value)}
                            />
                            <button
                                className="rr-button rr-button--secondary"
                                type="submit"
                                disabled={usernameSaving}
                                style={{ width: "auto" }}
                            >
                                {usernameSaving && <span className="rr-spinner" />}
                                Add
                            </button>
                        </form>
                    )}
                </div>

                <div className="rr-card">
                    <div className="rr-card__title">Profile</div>
                    <p className="rr-card__subtitle">Your name and birthdate.</p>
                    {profileError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {profileError}
                        </div>
                    )}
                    <form onSubmit={handleProfileSubmit}>
                        <div className="rr-field">
                            <label htmlFor="givenName">Given name</label>
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
                        </div>
                        <div className="rr-field">
                            <label htmlFor="familyName">Family name</label>
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
                        </div>
                        <div className="rr-field">
                            <label htmlFor="birthdate">Birthdate</label>
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
                        </div>
                        <button
                            className="rr-button rr-button--primary"
                            type="submit"
                            disabled={profileSaving}
                            style={{ width: "auto" }}
                        >
                            {profileSaving && <span className="rr-spinner" />}
                            Save profile
                        </button>
                        {profileSaved && (
                            <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                                Saved.
                            </span>
                        )}
                    </form>
                </div>

                <div className="rr-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div className="rr-card__title">Contacts</div>
                            <p className="rr-card__subtitle">
                                The e-mail addresses and phone numbers on your account. Verify one to sign in with it.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="rr-button rr-button--secondary"
                            style={{ width: "auto" }}
                            onClick={openAddContactModal}
                        >
                            + Add
                        </button>
                    </div>
                    {aliasError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {aliasError}
                        </div>
                    )}
                    {contactsError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {contactsError}
                        </div>
                    )}

                    {contacts.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                            <table className="rr-table">
                                <thead>
                                    <tr>
                                        <th>Contact</th>
                                        <th>Type</th>
                                        <th>Status</th>
                                        <th>Sign-in</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.map((c) => {
                                        const enabledAlias = findAliasForContact(aliases, c);
                                        const isLastEnabledAlias = !!enabledAlias && enabledAliasCount <= 1;
                                        const isLastVerifiedContact = c.verified && verifiedContactCount <= 1;
                                        const removeDisabled = isLastVerifiedContact || isLastEnabledAlias;
                                        return (
                                            <tr key={`${c.type}:${c.contact}`}>
                                                <td>{c.contact}</td>
                                                <td>{CONTACT_TYPE_LABELS[c.type]}</td>
                                                <td>
                                                    <span className={"rr-badge" + (c.verified ? " rr-badge--success" : "")}>
                                                        {c.verified ? "Verified" : "Unverified"}
                                                    </span>
                                                </td>
                                                <td>
                                                    {c.verified ? (
                                                        <button
                                                            type="button"
                                                            className="rr-button--text"
                                                            onClick={() => handleToggleContactSignIn(c)}
                                                            disabled={!!enabledAlias && isLastEnabledAlias}
                                                            title={
                                                                enabledAlias && isLastEnabledAlias
                                                                    ? "You must keep at least one sign-in method enabled."
                                                                    : undefined
                                                            }
                                                        >
                                                            {enabledAlias ? "Disable" : "Enable"}
                                                        </button>
                                                    ) : (
                                                        <button type="button" className="rr-button--text" onClick={() => openVerifyModal(c)}>
                                                            Verify
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="rr-button--text"
                                                        onClick={() => handleRemoveContact(c)}
                                                        disabled={removeDisabled}
                                                        title={
                                                            isLastVerifiedContact
                                                                ? "You must keep at least one verified contact."
                                                                : isLastEnabledAlias
                                                                  ? "You must keep at least one sign-in method enabled."
                                                                  : undefined
                                                        }
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="rr-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div className="rr-card__title">Sign-in methods</div>
                            <p className="rr-card__subtitle">Passwords, authenticator apps, passkeys, and security keys.</p>
                        </div>
                        <button
                            type="button"
                            className="rr-button rr-button--secondary"
                            style={{ width: "auto" }}
                            onClick={() => setAddMethodModalOpen(true)}
                        >
                            + Add
                        </button>
                    </div>
                    {secretError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {secretError}
                        </div>
                    )}
                    {secrets !== null && secrets.length === 0 && <p className="rr-hint">No sign-in methods added yet.</p>}
                    {secrets && secrets.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                            <table className="rr-table">
                                <thead>
                                    <tr>
                                        <th>Method</th>
                                        <th>Added</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {secrets.map((s) => (
                                        <tr key={s.uid}>
                                            <td>
                                                {SECRET_TYPE_LABELS[s.type]}
                                                {s.hint && (
                                                    <span className="rr-hint" style={{ marginLeft: "0.4rem" }}>
                                                        ({s.hint})
                                                    </span>
                                                )}
                                            </td>
                                            <td>{formatDate(s.dateCreated)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="rr-button--text"
                                                    onClick={() => handleDeleteSecret(s.uid, SECRET_TYPE_LABELS[s.type].toLowerCase())}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <Modal open={usernameModalOpen} onClose={closeChangeUsernameModal} title="Change username">
                {usernameError && (
                    <div className="rr-alert rr-alert--error" role="alert">
                        {usernameError}
                    </div>
                )}
                <form onSubmit={handleChangeUsername}>
                    <div className="rr-field">
                        <label htmlFor="usernameChange">Username</label>
                        <input
                            id="usernameChange"
                            className="rr-input"
                            type="text"
                            required
                            value={usernameValue}
                            onChange={(e) => setUsernameValue(e.target.value)}
                        />
                    </div>
                    <button className="rr-button rr-button--primary" type="submit" disabled={usernameSaving} style={{ width: "auto" }}>
                        {usernameSaving && <span className="rr-spinner" />}
                        Save
                    </button>
                </form>
            </Modal>

            <Modal open={addContactModalOpen} onClose={closeAddContactModal} title="Add a contact">
                {addContactError && (
                    <div className="rr-alert rr-alert--error" role="alert">
                        {addContactError}
                    </div>
                )}
                <form onSubmit={handleAddContact}>
                    <div className="rr-field">
                        <label htmlFor="newContactType">Type</label>
                        <select
                            id="newContactType"
                            className="rr-input"
                            value={newContactType}
                            onChange={(e) => setNewContactType(e.target.value as RegistrationIdentifierType)}
                        >
                            <option value="email">E-mail</option>
                            <option value="phone">Phone</option>
                        </select>
                    </div>
                    <div className="rr-field">
                        <label htmlFor="newContactValue">{newContactType === "email" ? "E-mail address" : "Phone number"}</label>
                        <input
                            id="newContactValue"
                            className="rr-input"
                            type="text"
                            required
                            placeholder={newContactType === "email" ? "you@example.com" : "+1 555 123 4567"}
                            value={newContactValue}
                            onChange={(e) => setNewContactValue(e.target.value)}
                        />
                    </div>
                    <button className="rr-button rr-button--primary" type="submit" disabled={contactAdding} style={{ width: "auto" }}>
                        {contactAdding && <span className="rr-spinner" />}
                        Add
                    </button>
                </form>
            </Modal>

            <Modal open={verifyModalOpen} onClose={closeVerifyModal} title="Verify contact">
                <p className="rr-hint" style={{ marginTop: 0 }}>
                    We sent a code to {verifyingContact?.contact}.
                </p>
                {verifyError && (
                    <div className="rr-alert rr-alert--error" role="alert">
                        {verifyError}
                    </div>
                )}
                <form onSubmit={handleVerifyContact}>
                    <div className="rr-field">
                        <label htmlFor="verifyCode">Verification code</label>
                        <input
                            id="verifyCode"
                            className="rr-code-input"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="······"
                        />
                    </div>
                    <button className="rr-button rr-button--primary" type="submit" disabled={verifySaving} style={{ width: "auto" }}>
                        {verifySaving && <span className="rr-spinner" />}
                        Verify
                    </button>
                </form>
                <div className="rr-footer-link">
                    Didn&rsquo;t get a code?{" "}
                    <button type="button" className="rr-button--text" onClick={handleResendCode} disabled={resending}>
                        Resend
                    </button>
                    {resent && (
                        <span className="rr-hint" style={{ marginLeft: "0.5rem" }}>
                            Sent.
                        </span>
                    )}
                </div>
            </Modal>

            <Modal open={addMethodModalOpen} onClose={closeAddMethodModal} title="Add a sign-in method">
                {!addMethodType && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <button type="button" className="rr-button rr-button--secondary" onClick={() => setAddMethodType("password")}>
                            Password
                        </button>
                        <button type="button" className="rr-button rr-button--secondary" onClick={() => setAddMethodType("totp")}>
                            Authenticator app
                        </button>
                        <button type="button" className="rr-button rr-button--secondary" onClick={() => setAddMethodType("passkey")}>
                            Passkey
                        </button>
                        <button type="button" className="rr-button rr-button--secondary" onClick={() => setAddMethodType("fido2")}>
                            Security key
                        </button>
                    </div>
                )}

                {addMethodType === "password" && (
                    <form onSubmit={handlePasswordSubmit}>
                        {passwordError && (
                            <div className="rr-alert rr-alert--error" role="alert">
                                {passwordError}
                            </div>
                        )}
                        <div className="rr-field">
                            <label htmlFor="newPassword">New password</label>
                            <input
                                id="newPassword"
                                className="rr-input"
                                type="password"
                                autoComplete="new-password"
                                aria-invalid={newPassword.length > 0 && !isPasswordValid(newPassword, passwordCriteria)}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                            {newPassword.length > 0 && <PasswordCriteriaList password={newPassword} criteria={passwordCriteria} />}
                        </div>
                        <div className="rr-field">
                            <label htmlFor="confirmNewPassword">Confirm new password</label>
                            <input
                                id="confirmNewPassword"
                                className="rr-input"
                                type="password"
                                autoComplete="new-password"
                                aria-invalid={confirmNewPassword.length > 0 && confirmNewPassword !== newPassword}
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                            />
                            {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword && (
                                <div className="rr-error-text">Passwords do not match.</div>
                            )}
                        </div>
                        <div className="rr-field">
                            <label htmlFor="passwordHint">Label (optional)</label>
                            <input
                                id="passwordHint"
                                className="rr-input"
                                type="text"
                                placeholder="e.g. LastPass, 1Password"
                                value={methodHint}
                                onChange={(e) => setMethodHint(e.target.value)}
                            />
                        </div>
                        <button
                            className="rr-button rr-button--primary"
                            type="submit"
                            style={{ width: "auto" }}
                            disabled={
                                passwordSaving || !isPasswordValid(newPassword, passwordCriteria) || newPassword !== confirmNewPassword
                            }
                        >
                            {passwordSaving && <span className="rr-spinner" />}
                            Save password
                        </button>
                    </form>
                )}

                {addMethodType === "totp" && (
                    <div>
                        {totpError && (
                            <div className="rr-alert rr-alert--error" role="alert">
                                {totpError}
                            </div>
                        )}
                        {!totpSetup && (
                            <form onSubmit={handleAddTotp}>
                                <p className="rr-hint" style={{ marginTop: 0 }}>
                                    Add an authenticator app (e.g. Google Authenticator, 1Password) as a sign-in method.
                                </p>
                                <div className="rr-field">
                                    <label htmlFor="totpHint">Label (optional)</label>
                                    <input
                                        id="totpHint"
                                        className="rr-input"
                                        type="text"
                                        placeholder="e.g. LastPass, 1Password"
                                        value={methodHint}
                                        onChange={(e) => setMethodHint(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="rr-button rr-button--primary"
                                    style={{ width: "auto" }}
                                    disabled={totpAdding}
                                >
                                    {totpAdding && <span className="rr-spinner" />}
                                    Add authenticator app
                                </button>
                            </form>
                        )}
                        {totpSetup && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                                <p className="rr-hint" style={{ margin: 0 }}>
                                    Scan this QR code with your authenticator app, or enter the code manually. You won&rsquo;t be able
                                    to see this again.
                                </p>
                                <img src={totpSetup.qrDataUrl} alt="Authenticator app QR code" width={180} height={180} />
                                <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{totpSetup.secret}</code>
                                <button
                                    type="button"
                                    className="rr-button rr-button--secondary"
                                    style={{ width: "auto" }}
                                    onClick={closeAddMethodModal}
                                >
                                    Done
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {addMethodType === "passkey" && (
                    <form onSubmit={handleAddPasskey}>
                        {passkeyError && (
                            <div className="rr-alert rr-alert--error" role="alert">
                                {passkeyError}
                            </div>
                        )}
                        <p className="rr-hint" style={{ marginTop: 0 }}>
                            Your browser will prompt you to create a passkey.
                        </p>
                        <div className="rr-field">
                            <label htmlFor="passkeyHint">Label (optional)</label>
                            <input
                                id="passkeyHint"
                                className="rr-input"
                                type="text"
                                placeholder="e.g. iPhone, YubiKey"
                                value={methodHint}
                                onChange={(e) => setMethodHint(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            className="rr-button rr-button--primary"
                            style={{ width: "auto" }}
                            disabled={passkeyAdding}
                        >
                            {passkeyAdding && <span className="rr-spinner" />}
                            Add passkey
                        </button>
                    </form>
                )}

                {addMethodType === "fido2" && (
                    <form onSubmit={handleAddFido2}>
                        {fido2Error && (
                            <div className="rr-alert rr-alert--error" role="alert">
                                {fido2Error}
                            </div>
                        )}
                        <p className="rr-hint" style={{ marginTop: 0 }}>
                            Insert your security key and follow your browser&rsquo;s prompt.
                        </p>
                        <div className="rr-field">
                            <label htmlFor="fido2Hint">Label (optional)</label>
                            <input
                                id="fido2Hint"
                                className="rr-input"
                                type="text"
                                placeholder="e.g. YubiKey"
                                value={methodHint}
                                onChange={(e) => setMethodHint(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            className="rr-button rr-button--primary"
                            style={{ width: "auto" }}
                            disabled={fido2Adding}
                        >
                            {fido2Adding && <span className="rr-spinner" />}
                            Add security key
                        </button>
                    </form>
                )}
            </Modal>
        </div>
    );
}
