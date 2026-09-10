///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import {
    ApiRequestError,
    AuthorizeOutcome,
    AuthorizeQueryParams,
    requestAuthorization,
    submitConsent,
} from "../../shared/lib/api.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import AuthShell from "../../shared/components/layout/AuthShell.js";
import Alert from "../../shared/components/feedback/Alert.js";
import Button from "../../shared/components/buttons/Button.js";

const OAUTH_QUERY_KEYS = [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce",
    "prompt",
] as const satisfies readonly (keyof AuthorizeQueryParams)[];

export interface AuthorizePageProps extends AuthorizeQueryParams {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `wwwRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

/** Reads the OAuth 2.0 request's own query parameters straight through, unmodified, for `requestAuthorization()`. */
export async function fetchProps(req: { query?: Record<string, string | string[]> }): Promise<AuthorizeQueryParams> {
    const props: AuthorizeQueryParams = {};
    for (const key of OAUTH_QUERY_KEYS) {
        const value = req.query?.[key];
        if (typeof value === "string") {
            props[key] = value;
        }
    }
    return props;
}

/** A short, human-readable description of a known OIDC scope; falls back to the raw scope name otherwise. */
function describeScope(scope: string): string {
    switch (scope) {
        case "openid":
            return "Confirm your identity";
        case "profile":
            return "Your basic profile information";
        case "email":
            return "Your email address";
        case "phone":
            return "Your phone number";
        case "offline_access":
            return "Access your account while you're away";
        default:
            return scope;
    }
}

/** The current page's own path + query string, for a `returnTo` hand-off to sign-in. */
function currentUrl(): string {
    return window.location.pathname + window.location.search;
}

export default function AuthorizePage({ userUid, siteSettings, ...params }: AuthorizePageProps) {
    const [outcome, setOutcome] = useState<AuthorizeOutcome | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deciding, setDeciding] = useState(false);

    useEffect(() => {
        if (!userUid) {
            window.location.replace(`/auth/signin?returnTo=${encodeURIComponent(currentUrl())}`);
            return;
        }

        requestAuthorization(params)
            .then((result) => {
                if ("redirectTo" in result) {
                    window.location.href = result.redirectTo;
                } else if ("loginRequired" in result) {
                    // Defensive: the session that produced `userUid` above may have expired between the
                    // page load and this call.
                    window.location.replace(`/auth/signin?returnTo=${encodeURIComponent(currentUrl())}`);
                } else {
                    setOutcome(result);
                }
            })
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again."));
        // The OAuth request params driving this are fixed for the lifetime of this page load — a
        // re-decision goes through handleDecision below, not a re-run of this effect.
    }, [userUid]);

    async function handleDecision(requestId: string, approved: boolean) {
        setDeciding(true);
        setError(null);
        try {
            const { redirectTo } = await submitConsent(requestId, approved);
            window.location.href = redirectTo;
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
            setDeciding(false);
        }
    }

    const consent = outcome && "consentRequired" in outcome ? outcome : null;
    const scopes = consent ? consent.client.scope.split(" ").filter(Boolean) : [];

    return (
        <AuthShell brand settings={siteSettings}>
            <div className="rr-card">
                {error && <Alert>{error}</Alert>}

                {!consent && !error && <p className="rr-card__subtitle">Please wait&hellip;</p>}

                {consent && (
                    <>
                        {consent.client.logoUri && (
                            <img
                                src={consent.client.logoUri}
                                alt={`${consent.client.clientName} logo`}
                                width={48}
                                height={48}
                                style={{ marginBottom: "0.75rem" }}
                            />
                        )}
                        <div className="rr-card__title">{consent.client.clientName} wants to access your account</div>
                        <p className="rr-card__subtitle">This application is requesting the following access:</p>
                        <ul>
                            {scopes.map((scope) => (
                                <li key={scope}>{describeScope(scope)}</li>
                            ))}
                        </ul>
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                            <Button
                                type="button"
                                variant="primary"
                                style={{ width: "auto" }}
                                loading={deciding}
                                disabled={deciding}
                                onClick={() => handleDecision(consent.requestId, true)}
                            >
                                Approve
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                style={{ width: "auto" }}
                                disabled={deciding}
                                onClick={() => handleDecision(consent.requestId, false)}
                            >
                                Deny
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </AuthShell>
    );
}
