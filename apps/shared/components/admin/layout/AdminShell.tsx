///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren, ReactNode, useEffect, useState } from "react";
import { ApiRequestError, ApiUser, getCurrentUser, logout } from "../../../lib/api.js";
import { ensureElevated } from "../../../lib/adminApi.js";
import { useSessionRefresh } from "../../../lib/useSessionRefresh.js";
import ElevationHost from "../../elevation/ElevationHost.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface AdminShellProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

type Status = "checking" | "denied" | "error" | "authorized";

/**
 * Gates every `apps/admin` page behind the `admin` trusted role *and* a fresh elevation, via
 * `ensureElevated()`.
 */
export default function AdminShell({ userUid, children }: PropsWithChildren<AdminShellProps>) {
    const [status, setStatus] = useState<Status>("checking");
    const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Keeps the access token alive (and this shell usable) for as long as the refresh token is valid —
    // see useSessionRefresh's doc comment. Handles redirecting to sign-in itself when no session can be
    // recovered, so the effect below no longer needs to.
    useSessionRefresh(userUid);

    useEffect(() => {
        if (!userUid) {
            return;
        }

        getCurrentUser()
            .then(setCurrentUser)
            .catch(() => undefined);

        // Blocks on the elevation prompt (via apiFetch/ElevationHost, triggered by the returned api-104 error
        // ensureElevated() gets back when not yet elevated) before the console renders as usable. If the error
        // returned is `api-103`, that means the caller was elevated but genuinely isn't a trusted user and
        // therefore cannot access the admin console.
        ensureElevated()
            .then(() => setStatus("authorized"))
            .catch((err) => {
                if (err instanceof ApiRequestError && err.code === "api-103") {
                    setStatus("denied");
                    return;
                }
                setError(err instanceof ApiRequestError ? err.message : "Could not verify administrator access.");
                setStatus("error");
            });
    }, [userUid]);

    async function handleSignOut() {
        await logout();
        window.location.href = "/auth/signin";
    }

    let content: ReactNode;
    if (!userUid || status === "checking") {
        content = <div className="rr-page" />;
    } else if (status === "denied") {
        content = (
            <div className="rr-page">
                <div className="rr-container">
                    <Alert>You do not have administrator access.</Alert>
                    <p className="rr-hint">
                        <a href="/">Return home</a>
                    </p>
                </div>
            </div>
        );
    } else if (status === "error") {
        content = (
            <div className="rr-page">
                <div className="rr-container">
                    <Alert>{error}</Alert>
                </div>
            </div>
        );
    } else {
        content = (
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

    return (
        <>
            {content}
            <ElevationHost />
        </>
    );
}
