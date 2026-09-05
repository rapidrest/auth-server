///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import { AdminClient, deleteClient, listClients } from "../../shared/lib/adminApi.js";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import ClientTable from "../../shared/components/admin/oauth-clients/ClientTable.js";
import DeleteClientModal from "../../shared/components/admin/oauth-clients/DeleteClientModal.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";

const PAGE_SIZE = 25;

interface OAuthClientsPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function OAuthClientsListPage({ userUid }: OAuthClientsPageProps) {
    return (
        <AdminShell userUid={userUid}>
            <OAuthClientsListContent />
        </AdminShell>
    );
}

function OAuthClientsListContent() {
    const [page, setPage] = useState(0);
    const [clients, setClients] = useState<AdminClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<AdminClient | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        listClients({ page, limit: PAGE_SIZE })
            .then(setClients)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load clients."))
            .finally(() => setLoading(false));
    }, [page]);

    function openDeleteModal(client: AdminClient) {
        setDeleteError(null);
        setDeleteTarget(client);
    }

    async function handleConfirmDelete(purge: boolean) {
        // Only reachable via DeleteClientModal's own confirm button, which renders (and is therefore only
        // clickable) once `deleteTarget` is already set — DeleteClientModal returns null while `client` is null.
        setDeleting(true);
        setDeleteError(null);
        try {
            await deleteClient(deleteTarget!.uid, deleteTarget!.version, purge);
            setClients((prev) => prev.filter((c) => c.uid !== deleteTarget!.uid));
            setDeleteTarget(null);
        } catch (err) {
            setDeleteError(err instanceof ApiRequestError ? err.message : "Could not delete this client.");
        } finally {
            setDeleting(false);
        }
    }

    const hasNextPage = clients.length === PAGE_SIZE;

    return (
        <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <div className="rr-card__title" style={{ marginBottom: 0 }}>
                    OAuth Clients
                </div>
                <a href="/admin/oauth-clients/new">
                    <Button type="button" style={{ width: "auto" }}>
                        + New client
                    </Button>
                </a>
            </div>

            {error && <Alert>{error}</Alert>}

            {loading ? (
                <p className="rr-hint">Loading&hellip;</p>
            ) : (
                <ClientTable clients={clients} onDelete={openDeleteModal} />
            )}

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                    Previous
                </Button>
                <span className="rr-hint">Page {page + 1}</span>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={!hasNextPage || loading}
                    onClick={() => setPage((p) => p + 1)}
                >
                    Next
                </Button>
            </div>

            <DeleteClientModal
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                client={deleteTarget}
                onConfirm={handleConfirmDelete}
                deleting={deleting}
                error={deleteError}
            />
        </>
    );
}
