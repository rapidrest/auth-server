///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { AdminClient, createClient } from "../../../lib/adminApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import RoleScopeEditor from "../users/RoleScopeEditor.js";

export interface CreateClientFormProps {
    onCreated: (client: AdminClient) => void;
}

type ClientType = "confidential" | "public";
type TokenEndpointAuthMethod = "client_secret_basic" | "client_secret_post" | "none";

export default function CreateClientForm({ onCreated }: CreateClientFormProps) {
    const [clientName, setClientName] = useState("");
    const [clientType, setClientType] = useState<ClientType>("confidential");
    const [redirectUris, setRedirectUris] = useState<string[]>([]);
    const [grantTypes, setGrantTypes] = useState<string[]>(["authorization_code"]);
    const [responseTypes, setResponseTypes] = useState<string[]>(["code"]);
    const [scopes, setScopes] = useState<string[]>(["openid", "profile"]);
    const [tokenEndpointAuthMethod, setTokenEndpointAuthMethod] = useState<TokenEndpointAuthMethod>("client_secret_basic");
    const [firstParty, setFirstParty] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (!clientName.trim()) {
            setError("A client name is required.");
            return;
        }
        if (redirectUris.length === 0) {
            setError("At least one redirect URI is required.");
            return;
        }

        setSaving(true);
        try {
            const client = await createClient({
                clientName: clientName.trim(),
                clientType,
                redirectUris,
                grantTypes,
                responseTypes,
                scope: scopes.join(" "),
                // A public client authenticates via PKCE alone — the server also enforces this
                // server-side regardless of what's submitted here (see BaseOAuthClientRoute).
                tokenEndpointAuthMethod: clientType === "public" ? "none" : tokenEndpointAuthMethod,
                firstParty,
            });
            onCreated(client);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not register this client.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="newClientName">Client name</label>
                <input
                    id="newClientName"
                    className="rr-input"
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                />
            </div>

            <div className="rr-field">
                <label htmlFor="newClientType">Client type</label>
                <select
                    id="newClientType"
                    className="rr-input"
                    value={clientType}
                    onChange={(e) => setClientType(e.target.value as ClientType)}
                >
                    <option value="confidential">Confidential (server-side app)</option>
                    <option value="public">Public (native app or SPA)</option>
                </select>
            </div>

            <RoleScopeEditor
                id="newClientRedirectUris"
                label="Redirect URIs"
                values={redirectUris}
                onChange={setRedirectUris}
                placeholder="https://example.com/callback"
            />
            <RoleScopeEditor
                id="newClientGrantTypes"
                label="Grant types"
                values={grantTypes}
                onChange={setGrantTypes}
                placeholder="e.g. refresh_token"
            />
            <RoleScopeEditor
                id="newClientResponseTypes"
                label="Response types"
                values={responseTypes}
                onChange={setResponseTypes}
                placeholder="e.g. code"
            />
            <RoleScopeEditor
                id="newClientScopes"
                label="Scope"
                values={scopes}
                onChange={setScopes}
                placeholder="e.g. offline_access"
            />

            {clientType === "confidential" && (
                <div className="rr-field">
                    <label htmlFor="newClientAuthMethod">Token endpoint auth method</label>
                    <select
                        id="newClientAuthMethod"
                        className="rr-input"
                        value={tokenEndpointAuthMethod}
                        onChange={(e) => setTokenEndpointAuthMethod(e.target.value as TokenEndpointAuthMethod)}
                    >
                        <option value="client_secret_basic">client_secret_basic</option>
                        <option value="client_secret_post">client_secret_post</option>
                    </select>
                </div>
            )}

            <div className="rr-field">
                <label htmlFor="newClientFirstParty" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                        id="newClientFirstParty"
                        type="checkbox"
                        checked={firstParty}
                        onChange={(e) => setFirstParty(e.target.checked)}
                    />
                    First-party (skip the consent screen)
                </label>
            </div>

            <Button type="submit" style={{ width: "auto" }} loading={saving} disabled={saving}>
                Register client
            </Button>
        </form>
    );
}
