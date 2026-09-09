///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError, markImpersonating } from "../../shared/lib/api.js";
import { AdminUser, deleteUser, getUser, impersonateUser } from "../../shared/lib/adminApi.js";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import UserOverviewCard from "../../shared/components/admin/users/detail/UserOverviewCard.js";
import UserProfileCard from "../../shared/components/admin/users/detail/UserProfileCard.js";
import UserIdentifiersCard from "../../shared/components/admin/users/detail/UserIdentifiersCard.js";
import UserSecretsCard from "../../shared/components/admin/users/detail/UserSecretsCard.js";
import DeleteUserModal from "../../shared/components/admin/users/DeleteUserModal.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";

interface DetailPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** The `:uid` dynamic segment captured from this file's `[uid].tsx` name — see `@rapidrest/react`'s
     * `ReactRoute` doc comment for the convention. Always present when this route matched. */
    params: { uid: string };
}

export default function UserDetailPage({ userUid, params }: DetailPageProps) {
    return (
        <AdminShell userUid={userUid}>
            <UserDetailContent uid={params.uid} />
        </AdminShell>
    );
}

function UserDetailContent({ uid }: { uid: string }) {
    const [user, setUser] = useState<AdminUser | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [impersonating, setImpersonating] = useState(false);
    const [impersonateError, setImpersonateError] = useState<string | null>(null);

    useEffect(() => {
        getUser(uid)
            .then(setUser)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this account."))
            .finally(() => setLoaded(true));
    }, [uid]);

    async function handleConfirmDelete(purge: boolean) {
        // Only reachable via DeleteUserModal's own confirm button, which is only rendered (and therefore
        // only clickable) once `user` is already loaded — see the `loaded && user` guard below.
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteUser(user!.uid, user!.version, purge);
            window.location.href = "/admin";
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete this account.");
            setDeleting(false);
        }
    }

    async function handleImpersonate() {
        setImpersonating(true);
        setImpersonateError(null);
        try {
            await impersonateUser(user!.uid);
            markImpersonating();
            window.location.href = "/account";
        } catch (err) {
            setImpersonateError(err instanceof ApiRequestError ? err.message : "Could not impersonate this account.");
            setImpersonating(false);
        }
    }

    return (
        <>
            {!loaded && <p className="rr-hint">Loading&hellip;</p>}
            {loaded && error && <Alert>{error}</Alert>}
            {loaded && user && (
                <>
                    <div style={{ marginBottom: "1rem" }}>
                        <a href="/admin">&larr; Back to users</a>
                    </div>

                    <UserOverviewCard user={user} onUpdated={setUser} />
                    <UserProfileCard uid={user.uid} />
                    <UserIdentifiersCard uid={user.uid} />
                    <UserSecretsCard uid={user.uid} />

                    <div className="rr-card">
                        <div className="rr-card__title">Impersonate</div>
                        <p className="rr-card__subtitle">Sign in as this account to see exactly what it sees.</p>
                        {impersonateError && <Alert>{impersonateError}</Alert>}
                        <Button
                            variant="secondary"
                            type="button"
                            style={{ width: "auto" }}
                            loading={impersonating}
                            disabled={impersonating}
                            onClick={handleImpersonate}
                        >
                            Impersonate user
                        </Button>
                    </div>

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
        </>
    );
}
