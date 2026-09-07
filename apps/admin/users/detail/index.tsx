///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError, markImpersonating } from "../../../shared/lib/api.js";
import { AdminUser, deleteUser, getUser, impersonateUser } from "../../../shared/lib/adminApi.js";
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

/**
 * This framework has no dynamic route segments — the target account's uid is passed as `?uid=`. Exported
 * so its `typeof window === "undefined"` guard can be exercised directly in a `node`-environment test:
 * `UserDetailContent` (which calls this as a `useState` lazy initializer) is always mounted inside
 * `AdminShell`, which renders only its own "checking" placeholder — never `children` — during SSR (its
 * `status` only ever leaves `"checking"` via a `useEffect`, which doesn't run under
 * `renderToStaticMarkup`). So this function never actually runs with no `window` global as part of the
 * real page tree; the guard only gets exercised by calling it directly.
 */
export function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function UserDetailPage({ userUid }: DetailPageProps) {
    return (
        <AdminShell userUid={userUid}>
            <UserDetailContent />
        </AdminShell>
    );
}

function UserDetailContent() {
    const [targetUid] = useState<string | null>(readTargetUid);
    const [user, setUser] = useState<AdminUser | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [impersonating, setImpersonating] = useState(false);
    const [impersonateError, setImpersonateError] = useState<string | null>(null);

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
        // Only reachable via DeleteUserModal's own confirm button, which is only rendered (and therefore
        // only clickable) once `user` is already loaded — see the `targetUid && loaded && user` guard below.
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
        // Only reachable via the button below, which is only rendered (and therefore only clickable) once
        // `user` is already loaded — same reasoning as `handleConfirmDelete` above.
        if (!window.confirm(`Impersonate '${user!.uid}'? You'll be signed in as this account until you sign out.`)) {
            return;
        }
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
