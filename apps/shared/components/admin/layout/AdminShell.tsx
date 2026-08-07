import React, { PropsWithChildren, useEffect, useState } from "react";
import { ApiRequestError, ApiUser, getCurrentUser, logout } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface AdminShellProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

type Status = "checking" | "denied" | "error" | "authorized";

/**
 * Gates every `apps/admin` page behind the `admin` role and renders the shared nav chrome once authorized.
 * This is a UX convenience only since every admin API call is independently ACL-checked server-side regardless.
 */
export default function AdminShell({ userUid, children }: PropsWithChildren<AdminShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userUid) {
            window.location.replace("/auth/signin");
            return;
        }

        getCurrentUser()
            .then((user) => {
                setCurrentUser(user);
                setStatus(user.roles?.includes("admin") ? "authorized" : "denied");
            })
            .catch((err) => {
                setError(err instanceof ApiRequestError ? err.message : "Could not verify administrator access.");
                setStatus("error");
            });
    }, [userUid]);

    async function handleSignOut() {
        await logout();
        window.location.href = "/auth/signin";
    }

    if (!userUid || status === "checking") {
        return <div className="rr-page" />;
    }

    if (status === "denied") {
        return (
            <div className="rr-page">
                <div className="rr-container">
                    <Alert>You do not have administrator access.</Alert>
                    <p className="rr-hint">
                        <a href="/">Return home</a>
                    </p>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="rr-page">
                <div className="rr-container">
                    <Alert>{error}</Alert>
                </div>
            </div>
        );
    }

    return (
        <div className="rr-page">
            <div className="rr-container rr-container--wide">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                        <a href="/admin" className="rr-brand" style={{ flexDirection: "row", gap: "0.5rem" }}>
                            <img src="/images/logo.svg" width="28" height="28" alt="" />
                            <span>RapidREST Admin</span>
                        </a>
                        <a href="/admin">Users</a>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        {currentUser && <span className="rr-hint">{currentUser.uid}</span>}
                        <Button variant="text" type="button" onClick={handleSignOut}>
                            Sign out
                        </Button>
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
