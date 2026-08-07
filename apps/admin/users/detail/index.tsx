import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import { AdminUser, deleteUser, getUser } from "../../../shared/lib/adminApi.js";
import AdminShell from "../../../shared/components/admin/layout/AdminShell.js";
import UserOverviewCard from "../../../shared/components/admin/users/detail/UserOverviewCard.js";
import UserProfileCard from "../../../shared/components/admin/users/detail/UserProfileCard.js";
import UserIdentifiersCard from "../../../shared/components/admin/users/detail/UserIdentifiersCard.js";
import UserSecretsCard from "../../../shared/components/admin/users/detail/UserSecretsCard.js";
import DeleteUserModal from "../../../shared/components/admin/users/DeleteUserModal.js";
import Alert from "../../../shared/components/feedback/Alert.js";
import Button from "../../../shared/components/buttons/Button.js";

interface DetailPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

/** This framework has no dynamic route segments — the target account's uid is passed as `?uid=`. */
function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function UserDetailPage({ userUid }: DetailPageProps) {
    const [targetUid] = useState<string | null>(readTargetUid);
    const [user, setUser] = useState<AdminUser | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        if (!targetUid) {
            setLoaded(true);
            return;
        }
        getUser(targetUid)
            .then(setUser)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this account."))
            .finally(() => setLoaded(true));
    }, [targetUid]);

    async function handleConfirmDelete(purge: boolean) {
        if (!user) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteUser(user.uid, user.version, purge);
            window.location.href = "/admin";
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete this account.");
            setDeleting(false);
        }
    }

    return (
        <AdminShell userUid={userUid}>
            {!targetUid && <Alert>No account specified.</Alert>}
            {targetUid && !loaded && <p className="rr-hint">Loading&hellip;</p>}
            {targetUid && loaded && error && <Alert>{error}</Alert>}
            {targetUid && loaded && user && (
                <>
                    <div style={{ marginBottom: "1rem" }}>
                        <a href="/admin">&larr; Back to users</a>
                    </div>

                    <UserOverviewCard user={user} onUpdated={setUser} />
                    <UserProfileCard uid={user.uid} />
                    <UserIdentifiersCard uid={user.uid} />
                    <UserSecretsCard uid={user.uid} />

                    <div className="rr-card">
                        <div className="rr-card__title">Danger zone</div>
                        <p className="rr-card__subtitle">Deleting an account cannot be undone.</p>
                        <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setDeleteOpen(true)}>
                            Delete account
                        </Button>
                    </div>

                    <DeleteUserModal
                        open={deleteOpen}
                        onClose={() => setDeleteOpen(false)}
                        user={user}
                        onConfirm={handleConfirmDelete}
                        deleting={deleting}
                        error={deleteError}
                    />
                </>
            )}
        </AdminShell>
    );
}
