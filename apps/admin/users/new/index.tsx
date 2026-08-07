import React from "react";
import AdminShell from "../../../shared/components/admin/layout/AdminShell.js";
import CreateUserForm from "../../../shared/components/admin/users/CreateUserForm.js";

interface NewUserPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function NewUserPage({ userUid }: NewUserPageProps) {
    function handleCreated(uid: string) {
        window.location.href = `/admin/users/detail?uid=${encodeURIComponent(uid)}`;
    }

    return (
        <AdminShell userUid={userUid}>
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
