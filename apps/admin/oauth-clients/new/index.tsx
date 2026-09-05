///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import AdminShell from "../../../shared/components/admin/layout/AdminShell.js";
import CreateClientForm from "../../../shared/components/admin/oauth-clients/CreateClientForm.js";
import RevealSecretModal from "../../../shared/components/admin/oauth-clients/RevealSecretModal.js";
import { AdminClient } from "../../../shared/lib/adminApi.js";

interface NewOAuthClientPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function NewOAuthClientPage({ userUid }: NewOAuthClientPageProps) {
    // A `public` client's `createClient()` response never carries a `clientSecret` (none is ever
    // generated for one — see `BaseOAuthClientRoute.validateCreate`), so `handleCreated` navigates to
    // the detail page immediately for that case rather than waiting on a reveal modal that would
    // never open.
    const [createdClient, setCreatedClient] = useState<AdminClient | null>(null);

    function goToDetail(uid: string) {
        window.location.href = `/admin/oauth-clients/detail?uid=${encodeURIComponent(uid)}`;
    }

    function handleCreated(client: AdminClient) {
        if (client.clientSecret) {
            setCreatedClient(client);
        } else {
            goToDetail(client.uid);
        }
    }

    return (
        <AdminShell userUid={userUid}>
            <div style={{ marginBottom: "1rem" }}>
                <a href="/admin/oauth-clients">&larr; Back to clients</a>
            </div>
            <div className="rr-card">
                <div className="rr-card__title">New OAuth client</div>
                <p className="rr-card__subtitle">Register a new OAuth 2.0 / OpenID Connect client application.</p>
                <CreateClientForm onCreated={handleCreated} />
            </div>

            <RevealSecretModal
                open={!!createdClient}
                onClose={() => createdClient && goToDetail(createdClient.uid)}
                clientSecret={createdClient?.clientSecret ?? null}
            />
        </AdminShell>
    );
}
