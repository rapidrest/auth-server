///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { AdminClient, updateClient } from "../../../lib/adminApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import RoleScopeEditor from "../users/RoleScopeEditor.js";

export interface ClientOverviewCardProps {
    client: AdminClient;
    onUpdated: (client: AdminClient) => void;
}

function formatDateTime(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function ClientOverviewCard({ client, onUpdated }: ClientOverviewCardProps) {
    const [clientName, setClientName] = useState(client.clientName);
    const [redirectUris, setRedirectUris] = useState<string[]>(client.redirectUris);
    const [grantTypes, setGrantTypes] = useState<string[]>(client.grantTypes);
    const [responseTypes, setResponseTypes] = useState<string[]>(client.responseTypes);
    const [scopes, setScopes] = useState<string[]>(client.scope ? client.scope.split(" ").filter(Boolean) : []);
    const [firstParty, setFirstParty] = useState(!!client.firstParty);
    const [disabled, setDisabled] = useState(!!client.disabled);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // Reseed only when a *different* client is loaded, matching UserOverviewCard's own convention.
    useEffect(() => {
        setClientName(client.clientName);
        setRedirectUris(client.redirectUris);
        setGrantTypes(client.grantTypes);
        setResponseTypes(client.responseTypes);
        setScopes(client.scope ? client.scope.split(" ").filter(Boolean) : []);
        setFirstParty(!!client.firstParty);
        setDisabled(!!client.disabled);
        setSaved(false);
    }, [client.uid]);

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateClient({
                uid: client.uid,
                version: client.version,
                clientName,
                redirectUris,
                grantTypes,
                responseTypes,
                scope: scopes.join(" "),
                firstParty,
                disabled,
            });
            onUpdated(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save this client.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Overview</div>
            <p className="rr-card__subtitle">Redirect URIs, grant types, scope, and status.</p>
            {error && <Alert>{error}</Alert>}

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 1rem", marginBottom: "1rem" }}>
                <dt className="rr-hint">Client ID</dt>
                <dd style={{ fontFamily: "monospace" }}>{client.clientId}</dd>
                <dt className="rr-hint">Type</dt>
                <dd>{client.clientType === "confidential" ? "Confidential" : "Public"}</dd>
                <dt className="rr-hint">Created</dt>
                <dd>{formatDateTime(client.dateCreated)}</dd>
                <dt className="rr-hint">Modified</dt>
                <dd>{formatDateTime(client.dateModified)}</dd>
            </dl>

            <div className="rr-field">
                <label htmlFor="clientOverviewName">Client name</label>
                <input
                    id="clientOverviewName"
                    className="rr-input"
                    type="text"
                    value={clientName}
                    onChange={(e) => {
                        setClientName(e.target.value);
                        setSaved(false);
                    }}
                />
            </div>

            <RoleScopeEditor id="clientOverviewRedirectUris" label="Redirect URIs" values={redirectUris} onChange={setRedirectUris} />
            <RoleScopeEditor id="clientOverviewGrantTypes" label="Grant types" values={grantTypes} onChange={setGrantTypes} />
            <RoleScopeEditor id="clientOverviewResponseTypes" label="Response types" values={responseTypes} onChange={setResponseTypes} />
            <RoleScopeEditor id="clientOverviewScopes" label="Scope" values={scopes} onChange={setScopes} />

            <div className="rr-field">
                <label htmlFor="clientOverviewFirstParty" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="clientOverviewFirstParty"
                        type="checkbox"
                        checked={firstParty}
                        onChange={(e) => {
                            setFirstParty(e.target.checked);
                            setSaved(false);
                        }}
                    />
                    First-party (skip the consent screen)
                </label>
            </div>

            <div className="rr-field">
                <label htmlFor="clientOverviewDisabled" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="clientOverviewDisabled"
                        type="checkbox"
                        checked={disabled}
                        onChange={(e) => {
                            setDisabled(e.target.checked);
                            setSaved(false);
                        }}
                    />
                    Disabled (rejects every authorization/token request for this client)
                </label>
            </div>

            <Button type="button" onClick={handleSave} loading={saving} disabled={saving} style={{ width: "auto" }}>
                Save
            </Button>
            {saved && (
                <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                    Saved.
                </span>
            )}
        </div>
    );
}
