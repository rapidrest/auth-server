///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../shared/lib/api.js";
import { AdminClient, deleteClient, getClient } from "../../../shared/lib/adminApi.js";
import AdminShell from "../../../shared/components/admin/layout/AdminShell.js";
import ClientOverviewCard from "../../../shared/components/admin/oauth-clients/ClientOverviewCard.js";
import ClientSecretCard from "../../../shared/components/admin/oauth-clients/ClientSecretCard.js";
import DeleteClientModal from "../../../shared/components/admin/oauth-clients/DeleteClientModal.js";
import Alert from "../../../shared/components/feedback/Alert.js";
import Button from "../../../shared/components/buttons/Button.js";

interface DetailPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

/**
 * This framework has no dynamic route segments — the target client's `uid` is passed as `?uid=`. See
 * `apps/admin/users/detail/index.tsx`'s own `readTargetUid` for why this is exported and safe under SSR.
 */
export function readTargetUid(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("uid");
}

export default function OAuthClientDetailPage({ userUid }: DetailPageProps) {
    return (
        <AdminShell userUid={userUid}>
            <OAuthClientDetailContent />
        </AdminShell>
    );
}

function OAuthClientDetailContent() {
    const [targetUid] = useState<string | null>(readTargetUid);
    const [client, setClient] = useState<AdminClient | null>(null);
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
        getClient(targetUid)
            .then(setClient)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this client."))
            .finally(() => setLoaded(true));
    }, [targetUid]);

    async function handleConfirmDelete(purge: boolean) {
        // Only reachable via DeleteClientModal's own confirm button, which is only rendered (and
        // therefore only clickable) once `client` is already loaded — see the `targetUid && loaded &&
        // client` guard below.
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteClient(client!.uid, client!.version, purge);
            window.location.href = "/admin/oauth-clients";
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete this client.");
            setDeleting(false);
        }
    }

    return (
        <>
            {!targetUid && <Alert>No client specified.</Alert>}
            {targetUid && !loaded && <p className="rr-hint">Loading&hellip;</p>}
            {targetUid && loaded && error && <Alert>{error}</Alert>}
            {targetUid && loaded && client && (
                <>
                    <div style={{ marginBottom: "1rem" }}>
                        <a href="/admin/oauth-clients">&larr; Back to clients</a>
                    </div>

                    <ClientOverviewCard client={client} onUpdated={setClient} />
                    <ClientSecretCard client={client} />

                    <div className="rr-card">
                        <div className="rr-card__title">Danger zone</div>
                        <p className="rr-card__subtitle">Deleting a client cannot be undone.</p>
                        <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setDeleteOpen(true)}>
                            Delete client
                        </Button>
                    </div>

                    <DeleteClientModal
                        open={deleteOpen}
                        onClose={() => setDeleteOpen(false)}
                        client={client}
                        onConfirm={handleConfirmDelete}
                        deleting={deleting}
                        error={deleteError}
                    />
                </>
            )}
        </>
    );
}
