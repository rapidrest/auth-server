import React, { useState } from "react";
import Button from "../../buttons/Button.js";
import { ApiRequestError, deleteAccount, Profile } from "../../../lib/api.js";
import DeleteAccountModal from "./DeleteAccountModal.js";

export interface AccountHeaderProps {
    profile: Profile | null;
    onLogout: () => void;
    /** Called after the account has been successfully deleted server-side, so the page can clear local
     * auth state and navigate away. */
    onAccountDeleted: () => void;
    /** Shows a link to the admin console. Omit/false for non-admin accounts. */
    isAdmin?: boolean;
}

export default function AccountHeader({ profile, onLogout, onAccountDeleted, isAdmin }: AccountHeaderProps) {
    const email = profile?.contacts?.find((c) => c.type === "email")?.contact;
    const displayName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ") || email || "there";
    const initial = (profile?.givenName || email || "?").charAt(0).toUpperCase();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    function openDeleteModal() {
        setDeleteError(null);
        setDeleteModalOpen(true);
    }

    function closeDeleteModal() {
        if (deleting) return;
        setDeleteModalOpen(false);
        setDeleteError(null);
    }

    async function handleConfirmDelete() {
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteAccount();
            onAccountDeleted();
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete your account.");
            setDeleting(false);
        }
    }

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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
                <Button variant="text" type="button" onClick={openDeleteModal}>
                    Delete account
                </Button>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
                {isAdmin && (
                    <a href="/admin">
                        <Button variant="secondary" type="button">
                            Admin console
                        </Button>
                    </a>
                )}
                <Button variant="secondary" type="button" onClick={onLogout}>
                    Log out
                </Button>
            </div>

            <DeleteAccountModal
                open={deleteModalOpen}
                onClose={closeDeleteModal}
                onConfirm={handleConfirmDelete}
                deleting={deleting}
                error={deleteError}
            />
        </div>
    );
}
