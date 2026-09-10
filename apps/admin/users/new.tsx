///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import CreateUserForm from "../../shared/components/admin/users/CreateUserForm.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";

interface NewUserPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function NewUserPage({ userUid, siteSettings }: NewUserPageProps) {
    function handleCreated(uid: string) {
        window.location.href = `/admin/users/${encodeURIComponent(uid)}`;
    }

    return (
        <AdminShell userUid={userUid} settings={siteSettings}>
            <div style={{ marginBottom: "1rem" }}>
                <a href="/admin">&larr; Back to users</a>
            </div>
            <div className="rr-card">
                <div className="rr-card__title">New user</div>
                <p className="rr-card__subtitle">Create an account with an initial identifier, roles, and scopes.</p>
                <CreateUserForm onCreated={handleCreated} />
            </div>
        </AdminShell>
    );
}
