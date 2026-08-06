import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import QRCode from "qrcode";
import { ApiRequestError, createTotpSecret, SecretSummary } from "../../../_lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface TotpSecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

interface TotpSetup {
    secret: string;
    qrDataUrl: string;
}

export default function TotpSecretForm({ setSecrets, onClose }: TotpSecretFormProps) {
    const [hint, setHint] = useState("");
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setup, setSetup] = useState<TotpSetup | null>(null);

    async function handleAddTotp(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const created = await createTotpSecret(hint.trim() || undefined);
            const qrDataUrl = await QRCode.toDataURL(created.data.uri, { width: 220, margin: 1 });
            setSetup({ secret: created.data.secret, qrDataUrl });
            setSecrets((prev) => [...(prev ?? []), created]);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not add an authenticator app.");
        } finally {
            setAdding(false);
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
                    <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={onClose}>
                        Done
                    </Button>
                </div>
            )}
        </div>
    );
}
