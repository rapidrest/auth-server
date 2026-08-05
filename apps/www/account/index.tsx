import React, { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import {
    Alias,
    AliasType,
    ApiRequestError,
    logout,
    createAlias,
    createPasswordSecret,
    createProfile,
    createTotpSecret,
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
    SecretSummary,
    updateProfile,
} from "../_lib/api.js";
import {
    buildPasswordCriteria,
    FALLBACK_PASSWORD_REQUIREMENTS,
    isPasswordValid,
    PasswordCriteriaList,
} from "../_lib/passwordCriteria.js";

interface AccountPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

const ALIAS_TYPE_LABELS: Record<AliasType, string> = {
    email: "E-mail",
    phone: "Phone",
    name: "Username",
    oauth: "OAuth",
};

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

    // --- Aliases ---
    const [aliases, setAliases] = useState<Alias[] | null>(null);
    const [aliasError, setAliasError] = useState<string | null>(null);
    const [newAliasType, setNewAliasType] = useState<AliasType>("email");
    const [newAliasValue, setNewAliasValue] = useState("");
    const [aliasAdding, setAliasAdding] = useState(false);

    // --- Secrets (password / totp / passkey / fido2) ---
    const [secrets, setSecrets] = useState<SecretSummary[] | null>(null);
    const [secretError, setSecretError] = useState<string | null>(null);

    const [passwordRequirements, setPasswordRequirements] = useState(FALLBACK_PASSWORD_REQUIREMENTS);
    const passwordCriteria = useMemo(() => buildPasswordCriteria(passwordRequirements), [passwordRequirements]);
    const [showPasswordForm, setShowPasswordForm] = useState(false);
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

    async function handleAddAlias(e: FormEvent) {
        e.preventDefault();
        setAliasError(null);
        setAliasAdding(true);
        try {
            const created = await createAlias(newAliasType, newAliasValue.trim());
            setAliases((prev) => [...(prev ?? []), created]);
            setNewAliasValue("");
        } catch (err) {
            setAliasError(err instanceof ApiRequestError ? err.message : "Could not add that alias.");
        } finally {
            setAliasAdding(false);
        }
    }

    async function handleDeleteAlias(uid: string) {
        if (!window.confirm("Remove this sign-in identifier? You will no longer be able to use it to sign in.")) {
            return;
        }
        setAliasError(null);
        try {
            await deleteAlias(uid);
            // Reachable only via a row's own "Remove" button, which only exists once `aliases` has
            // already loaded — `prev` is never null here.
            setAliases((prev) => prev!.filter((a) => a.uid !== uid));
        } catch (err) {
            setAliasError(err instanceof ApiRequestError ? err.message : "Could not remove that alias.");
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

    const passwordSecrets = useMemo(() => (secrets ?? []).filter((s) => s.type === "password"), [secrets]);
    const totpSecrets = useMemo(() => (secrets ?? []).filter((s) => s.type === "totp"), [secrets]);
    const passkeySecrets = useMemo(() => (secrets ?? []).filter((s) => s.type === "passkey"), [secrets]);
    const fido2Secrets = useMemo(() => (secrets ?? []).filter((s) => s.type === "fido2"), [secrets]);

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
            const created = (await createPasswordSecret(newPassword)) as SecretSummary;
            // Secrets have no update endpoint — "changing" a password means creating the new one, then
            // removing any old password secret(s), as two separate (non-atomic) requests.
            for (const old of passwordSecrets) {
                await deleteSecret(old.uid);
            }
            setSecrets((prev) => [...(prev ?? []).filter((s) => s.type !== "password"), created]);
            setShowPasswordForm(false);
            setNewPassword("");
            setConfirmNewPassword("");
        } catch (err) {
            setPasswordError(err instanceof ApiRequestError ? err.message : "Could not save your password.");
        } finally {
            setPasswordSaving(false);
        }
    }

    async function handleAddTotp() {
        setTotpError(null);
        setTotpAdding(true);
        try {
            const created = await createTotpSecret();
            const qrDataUrl = await QRCode.toDataURL(created.data.uri, { width: 220, margin: 1 });
            setTotpSetup({ secret: created.data.secret, qrDataUrl });
            setSecrets((prev) => [...(prev ?? []), created]);
        } catch (err) {
            setTotpError(err instanceof ApiRequestError ? err.message : "Could not add an authenticator app.");
        } finally {
            setTotpAdding(false);
        }
    }

    async function handleAddPasskey() {
        setPasskeyError(null);
        setPasskeyAdding(true);
        try {
            const optionsJSON = (await getPasskeyRegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerPasskey(response);
            setSecrets((prev) => [...(prev ?? []), created]);
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

    async function handleAddFido2() {
        setFido2Error(null);
        setFido2Adding(true);
        try {
            const optionsJSON = (await getFido2RegistrationOptions()) as PublicKeyCredentialCreationOptionsJSON;
            const response = await startRegistration({ optionsJSON });
            const created = await registerFido2(response);
            setSecrets((prev) => [...(prev ?? []), created]);
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
                    <div className="rr-card__title">Sign-in identifiers</div>
                    <p className="rr-card__subtitle">
                        The e-mail addresses, phone numbers, and usernames you can use to sign in.
                    </p>
                    {aliasError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {aliasError}
                        </div>
                    )}
                    {aliases === null && !aliasError && <p className="rr-hint">Loading…</p>}
                    {aliases?.map((a) => (
                        <div className="rr-list-row" key={a.uid}>
                            <div>
                                <span className="rr-badge" style={{ marginRight: "0.5rem" }}>
                                    {ALIAS_TYPE_LABELS[a.type]}
                                </span>
                                {a.alias}
                                {!a.verified && (
                                    <span className="rr-hint" style={{ marginLeft: "0.5rem" }}>
                                        (unverified)
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                className="rr-button--text"
                                onClick={() => handleDeleteAlias(a.uid)}
                                disabled={aliases.length <= 1}
                                title={aliases.length <= 1 ? "You must keep at least one sign-in identifier." : undefined}
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    <form
                        onSubmit={handleAddAlias}
                        style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", alignItems: "flex-start" }}
                    >
                        <select
                            className="rr-input"
                            style={{ width: "auto" }}
                            value={newAliasType}
                            onChange={(e) => setNewAliasType(e.target.value as AliasType)}
                        >
                            <option value="email">E-mail</option>
                            <option value="phone">Phone</option>
                            <option value="name">Username</option>
                        </select>
                        <input
                            className="rr-input"
                            type="text"
                            required
                            placeholder={
                                newAliasType === "email" ? "you@example.com" : newAliasType === "phone" ? "+1 555 123 4567" : "username"
                            }
                            value={newAliasValue}
                            onChange={(e) => setNewAliasValue(e.target.value)}
                        />
                        <button className="rr-button rr-button--secondary" type="submit" disabled={aliasAdding} style={{ width: "auto" }}>
                            {aliasAdding && <span className="rr-spinner" />}
                            Add
                        </button>
                    </form>
                </div>

                <div className="rr-card">
                    <div className="rr-card__title">Sign-in methods</div>
                    <p className="rr-card__subtitle">Passwords, authenticator apps, passkeys, and security keys.</p>
                    {secretError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {secretError}
                        </div>
                    )}

                    <div className="rr-section-title">Password</div>
                    {passwordError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {passwordError}
                        </div>
                    )}
                    {!showPasswordForm && (
                        <div className="rr-list-row">
                            <div>{passwordSecrets.length > 0 ? "Password is set" : "No password set"}</div>
                            <button
                                type="button"
                                className="rr-button--text"
                                onClick={() => {
                                    setShowPasswordForm(true);
                                    setPasswordError(null);
                                }}
                            >
                                {passwordSecrets.length > 0 ? "Change password" : "Set password"}
                            </button>
                        </div>
                    )}
                    {showPasswordForm && (
                        <form onSubmit={handlePasswordSubmit}>
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
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <button
                                    className="rr-button rr-button--primary"
                                    type="submit"
                                    style={{ width: "auto" }}
                                    disabled={
                                        passwordSaving ||
                                        !isPasswordValid(newPassword, passwordCriteria) ||
                                        newPassword !== confirmNewPassword
                                    }
                                >
                                    {passwordSaving && <span className="rr-spinner" />}
                                    Save password
                                </button>
                                <button
                                    className="rr-button rr-button--secondary"
                                    type="button"
                                    style={{ width: "auto" }}
                                    onClick={() => {
                                        setShowPasswordForm(false);
                                        setNewPassword("");
                                        setConfirmNewPassword("");
                                        setPasswordError(null);
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="rr-section-title">Authenticator apps</div>
                    {totpError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {totpError}
                        </div>
                    )}
                    {totpSecrets.length === 0 && !totpSetup && <p className="rr-hint">No authenticator apps added yet.</p>}
                    {totpSecrets.map((s) => (
                        <div className="rr-list-row" key={s.uid}>
                            <div>Authenticator app added {formatDate(s.dateCreated)}</div>
                            <button type="button" className="rr-button--text" onClick={() => handleDeleteSecret(s.uid, "this authenticator app")}>
                                Remove
                            </button>
                        </div>
                    ))}
                    {totpSetup && (
                        <div className="rr-list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                            <p className="rr-hint" style={{ margin: 0 }}>
                                Scan this QR code with your authenticator app, or enter the code manually. You won&rsquo;t be able to
                                see this again.
                            </p>
                            <img src={totpSetup.qrDataUrl} alt="Authenticator app QR code" width={180} height={180} />
                            <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{totpSetup.secret}</code>
                            <button
                                type="button"
                                className="rr-button rr-button--secondary"
                                style={{ width: "auto" }}
                                onClick={() => setTotpSetup(null)}
                            >
                                Done
                            </button>
                        </div>
                    )}
                    {!totpSetup && (
                        <button
                            type="button"
                            className="rr-button rr-button--secondary"
                            style={{ width: "auto", marginTop: "0.6rem" }}
                            onClick={handleAddTotp}
                            disabled={totpAdding}
                        >
                            {totpAdding && <span className="rr-spinner" />}
                            Add authenticator app
                        </button>
                    )}

                    <div className="rr-section-title">Passkeys</div>
                    {passkeyError && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {passkeyError}
                        </div>
                    )}
                    {passkeySecrets.length === 0 && <p className="rr-hint">No passkeys added yet.</p>}
                    {passkeySecrets.map((s) => (
                        <div className="rr-list-row" key={s.uid}>
                            <div>Passkey added {formatDate(s.dateCreated)}</div>
                            <button type="button" className="rr-button--text" onClick={() => handleDeleteSecret(s.uid, "this passkey")}>
                                Remove
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="rr-button rr-button--secondary"
                        style={{ width: "auto", marginTop: "0.6rem" }}
                        onClick={handleAddPasskey}
                        disabled={passkeyAdding}
                    >
                        {passkeyAdding && <span className="rr-spinner" />}
                        Add passkey
                    </button>

                    <div className="rr-section-title">Security keys</div>
                    {fido2Error && (
                        <div className="rr-alert rr-alert--error" role="alert">
                            {fido2Error}
                        </div>
                    )}
                    {fido2Secrets.length === 0 && <p className="rr-hint">No security keys added yet.</p>}
                    {fido2Secrets.map((s) => (
                        <div className="rr-list-row" key={s.uid}>
                            <div>Security key added {formatDate(s.dateCreated)}</div>
                            <button type="button" className="rr-button--text" onClick={() => handleDeleteSecret(s.uid, "this security key")}>
                                Remove
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="rr-button rr-button--secondary"
                        style={{ width: "auto", marginTop: "0.6rem" }}
                        onClick={handleAddFido2}
                        disabled={fido2Adding}
                    >
                        {fido2Adding && <span className="rr-spinner" />}
                        Add security key
                    </button>
                </div>
            </div>
        </div>
    );
}
