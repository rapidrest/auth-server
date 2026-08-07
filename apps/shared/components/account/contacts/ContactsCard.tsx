import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import {
    Alias,
    ApiRequestError,
    Contact,
    createAlias,
    deleteAlias,
    Profile,
    RegistrationIdentifierType,
    resendContactVerificationCode,
    updateProfile,
    createProfile,
    verifyContact,
} from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import AddContactModal from "./AddContactModal.js";
import VerifyContactModal from "./VerifyContactModal.js";

const CONTACT_TYPE_LABELS: Record<RegistrationIdentifierType, string> = {
    email: "E-mail",
    phone: "Phone",
};

/** Finds the sign-in alias (if any) matching a contact, so the Contacts table can show its enabled state. */
function findAliasForContact(aliases: Alias[] | null, contact: Contact): Alias | undefined {
    return aliases?.find((a) => a.type === contact.type && a.alias === contact.contact);
}

export interface ContactsCardProps {
    profile: Profile | null;
    profileExists: boolean;
    aliases: Alias[] | null;
    aliasError: string | null;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    setProfileExists: Dispatch<SetStateAction<boolean>>;
    setAliases: Dispatch<SetStateAction<Alias[] | null>>;
}

export default function ContactsCard({
    profile,
    profileExists,
    aliases,
    aliasError,
    setProfile,
    setProfileExists,
    setAliases,
}: ContactsCardProps) {
    const contacts = profile?.contacts ?? [];
    const [contactsError, setContactsError] = useState<string | null>(null);

    const [addContactModalOpen, setAddContactModalOpen] = useState(false);
    const [addContactError, setAddContactError] = useState<string | null>(null);
    const [newContactType, setNewContactType] = useState<RegistrationIdentifierType>("email");
    const [newContactValue, setNewContactValue] = useState("");
    const [contactAdding, setContactAdding] = useState(false);

    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifyingContact, setVerifyingContact] = useState<Contact | null>(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [verifySaving, setVerifySaving] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    // An account must always retain at least one verified contact and at least one enabled sign-in alias —
    // both counts gate the Contacts table's Remove/Disable actions below.
    const verifiedContactCount = contacts.filter((c) => c.verified).length;
    const enabledAliasCount = (aliases ?? []).filter((a) => a.type === "email" || a.type === "phone").length;

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
            setVerifyError(
                err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.",
            );
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
                // Reachable only once `profile` and `aliases` have both loaded (they arrive together from
                // the same `getAccount()` call) — `prev` is never null in either branch here.
                await deleteAlias(existingAlias.uid);
                setAliases((prev) => prev!.filter((a) => a.uid !== existingAlias.uid));
            } else {
                const created = await createAlias(contact.type, contact.contact, true);
                setAliases((prev) => [...prev!, created]);
            }
        } catch (err) {
            setContactsError(
                err instanceof ApiRequestError ? err.message : "Could not update that contact's sign-in setting.",
            );
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

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div className="rr-card__title">Contacts</div>
                    <p className="rr-card__subtitle">
                        The e-mail addresses and phone numbers on your account. Verify one to sign in with it.
                    </p>
                </div>
                <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={openAddContactModal}>
                    +
                </Button>
            </div>
            {aliasError && <Alert>{aliasError}</Alert>}
            {contactsError && <Alert>{contactsError}</Alert>}

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
                                                <Button
                                                    variant="text"
                                                    type="button"
                                                    onClick={() => handleToggleContactSignIn(c)}
                                                    disabled={!!enabledAlias && isLastEnabledAlias}
                                                    title={
                                                        enabledAlias && isLastEnabledAlias
                                                            ? "You must keep at least one sign-in method enabled."
                                                            : undefined
                                                    }
                                                >
                                                    {enabledAlias ? "Disable" : "Enable"}
                                                </Button>
                                            ) : (
                                                <Button variant="text" type="button" onClick={() => openVerifyModal(c)}>
                                                    Verify
                                                </Button>
                                            )}
                                        </td>
                                        <td>
                                            <Button
                                                variant="text"
                                                type="button"
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
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <AddContactModal
                open={addContactModalOpen}
                onClose={closeAddContactModal}
                error={addContactError}
                adding={contactAdding}
                type={newContactType}
                setType={setNewContactType}
                value={newContactValue}
                setValue={setNewContactValue}
                onSubmit={handleAddContact}
            />

            <VerifyContactModal
                open={verifyModalOpen}
                onClose={closeVerifyModal}
                contact={verifyingContact}
                code={verifyCode}
                setCode={setVerifyCode}
                saving={verifySaving}
                error={verifyError}
                resending={resending}
                resent={resent}
                onSubmit={handleVerifyContact}
                onResend={handleResendCode}
            />
        </div>
    );
}
