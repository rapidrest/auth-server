///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, Dispatch, SetStateAction, useState } from "react";
import QRCode from "qrcode";
import { ApiRequestError, createTotpSecret, SecretSummary, updateSecret } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface TotpSecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

interface TotpSetup {
    uid: string;
    version: number;
    secret: string;
    qrDataUrl: string;
}

export default function TotpSecretForm({ setSecrets, onClose }: TotpSecretFormProps) {
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setup, setSetup] = useState<TotpSetup | null>(null);
    const [hint, setHint] = useState("");
    const [confirming, setConfirming] = useState(false);

    async function handleAddTotp(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const created = await createTotpSecret();
            const qrDataUrl = await QRCode.toDataURL(created.data.uri, { width: 220, margin: 1 });
            setSetup({ uid: created.uid, version: created.version, secret: created.data.secret, qrDataUrl });
            setSecrets((prev) => [...(prev ?? []), created]);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not add an authenticator app.");
        } finally {
            setAdding(false);
        }
    }

    async function handleConfirm() {
        // Only reachable via the Confirm button below, which only renders once `setup` exists.
        const { uid, version } = setup!;
        const trimmedHint = hint.trim();
        if (!trimmedHint) {
            onClose();
            return;
        }
        setError(null);
        setConfirming(true);
        try {
            const updated = await updateSecret({ uid, version, hint: trimmedHint });
            // The create step above always seeds `secrets` before this can run, so `prev` is never null here.
            setSecrets((prev) => prev!.map((s) => (s.uid === updated.uid ? updated : s)));
            onClose();
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save the label.");
        } finally {
            setConfirming(false);
        }
    }

    return (
        <div>
            {error && <Alert>{error}</Alert>}
            {!setup && (
                <form onSubmit={handleAddTotp}>
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        Add an authenticator app (e.g. Google Authenticator, 1Password) as a sign-in method.
                    </p>
                    <Button type="submit" style={{ width: "auto" }} loading={adding} disabled={adding}>
                        Add authenticator app
                    </Button>
                </form>
            )}
            {setup && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                    <p className="rr-hint" style={{ margin: 0 }}>
                        Scan this QR code with your authenticator app, or enter the code manually. You won&rsquo;t be able
                        to see this again.
                    </p>
                    <img src={setup.qrDataUrl} alt="Authenticator app QR code" width={180} height={180} />
                    <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{setup.secret}</code>
                    <FormField label="Label (optional)" htmlFor="totpHint">
                        <input
                            id="totpHint"
                            className="rr-input"
                            type="text"
                            placeholder="e.g. LastPass, 1Password"
                            value={hint}
                            onChange={(e) => setHint(e.target.value)}
                        />
                    </FormField>
                    <Button type="button" style={{ width: "auto" }} loading={confirming} disabled={confirming} onClick={handleConfirm}>
                        Confirm
                    </Button>
                </div>
            )}
        </div>
    );
}
