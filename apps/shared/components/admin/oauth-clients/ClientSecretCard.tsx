///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { AdminClient, regenerateClientSecret } from "../../../lib/adminApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import RevealSecretModal from "./RevealSecretModal.js";

export interface ClientSecretCardProps {
    client: AdminClient;
}

/** Only shown for a `confidential` client — a `public` client never has a secret to regenerate. */
export default function ClientSecretCard({ client }: ClientSecretCardProps) {
    const [regenerating, setRegenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

    if (client.clientType !== "confidential") {
        return null;
    }

    async function handleRegenerate() {
        setError(null);
        setRegenerating(true);
        try {
            const { clientSecret } = await regenerateClientSecret(client.uid);
            setRevealedSecret(clientSecret);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not regenerate this client's secret.");
        } finally {
            setRegenerating(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Client secret</div>
            <p className="rr-card__subtitle">
                The current secret&rsquo;s value can&rsquo;t be viewed again — generate a new one if it&rsquo;s been
                lost, which immediately invalidates the old one.
            </p>
            {error && <Alert>{error}</Alert>}
            <Button type="button" variant="secondary" style={{ width: "auto" }} loading={regenerating} disabled={regenerating} onClick={handleRegenerate}>
                Regenerate secret
            </Button>

            <RevealSecretModal open={!!revealedSecret} onClose={() => setRevealedSecret(null)} clientSecret={revealedSecret} />
        </div>
    );
}
