///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
    ApiRequestError,
    CreatedTotpSecret,
    createTotpSecret,
    discardSecret,
    SecretSummary,
    updateSecret,
} from "../../../lib/api.js";
import { verifyTotpCode } from "../../../lib/totp.js";
import Alert from "../../feedback/Alert.js";
import CodeInput from "../../forms/CodeInput.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface TotpSecretFormProps {
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
    onClose: () => void;
}

interface TotpSetup {
    summary: SecretSummary;
    secret: string;
    digits: number;
    period: number;
    algorithm: string;
    qrDataUrl: string;
}

/** The list-safe part of a just-created secret — leaves out `data`, the plaintext key, so it never sits in shared list state. */
function toSummary(created: CreatedTotpSecret): SecretSummary {
    return {
        uid: created.uid,
        version: created.version,
        type: created.type,
        userUid: created.userUid,
        dateCreated: created.dateCreated,
        hint: created.hint,
    };
}

/**
 * Removes a secret the user never proved works. If that can't be done (the short elevation window has lapsed,
 * or the network is down) the secret is still registered — and, as a `totp` secret, counts as a second factor
 * at sign-in — so it goes into the list where the user can see and remove it, rather than lingering unseen.
 */
async function discardUnproven(created: CreatedTotpSecret, setSecrets: TotpSecretFormProps["setSecrets"]) {
    try {
        await discardSecret(created.uid);
    } catch {
        setSecrets((prev) => [...(prev ?? []), toSummary(created)]);
    }
}

export default function TotpSecretForm({ setSecrets, onClose }: TotpSecretFormProps) {
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setup, setSetup] = useState<TotpSetup | null>(null);
    const [code, setCode] = useState("");
    const [hint, setHint] = useState("");
    const [confirming, setConfirming] = useState(false);
    // Once the code has matched, kept so a failed label save can be retried without asking for a code that has
    // since expired.
    const [verified, setVerified] = useState(false);
    // A secret the server already holds but the user hasn't proven works. The server registers it on creation
    // and it takes effect as a sign-in method immediately, so leaving it behind would lock someone out whose app
    // never got it — hence the cleanup below when this form goes away without it being proven.
    const unprovenRef = useRef<CreatedTotpSecret | null>(null);

    useEffect(
        () => () => {
            const unproven = unprovenRef.current;
            if (unproven) {
                void discardUnproven(unproven, setSecrets);
            }
        },
        // Deliberately empty: this only reads the ref at unmount, and `setSecrets` is a state setter.
        [],
    );

    async function handleAddTotp(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setAdding(true);
        try {
            const created = await createTotpSecret();
            unprovenRef.current = created;
            const qrDataUrl = await QRCode.toDataURL(created.data.uri, { width: 220, margin: 1 });
            const { secret, digits, period, algorithm } = created.data;
            setSetup({ summary: toSummary(created), secret, digits, period, algorithm, qrDataUrl });
        } catch (err) {
            // Failing after the secret was created (drawing its QR code) leaves one registered that the user
            // never saw and so can never set up.
            const orphan = unprovenRef.current;
            if (orphan) {
                unprovenRef.current = null;
                void discardUnproven(orphan, setSecrets);
            }
            setError(err instanceof ApiRequestError ? err.message : "Could not add an authenticator app.");
        } finally {
            setAdding(false);
        }
    }

    async function handleConfirm(e: FormEvent) {
        e.preventDefault();
        // Only reachable via the form below, which only renders once `setup` exists.
        const { summary } = setup!;
        setError(null);

        if (!verified) {
            let matches: boolean;
            try {
                matches = verifyTotpCode(setup, code);
            } catch {
                setError(
                    "This authenticator app uses settings that can't be checked here. Close this dialog to discard it and try again.",
                );
                return;
            }
            if (!matches) {
                setError(
                    "That code doesn't match. Make sure your authenticator app has this account, then enter the code it shows right now.",
                );
                return;
            }
            // Proven. From here on it's a real sign-in method: stop treating it as abandonable, and list it.
            unprovenRef.current = null;
            setVerified(true);
            setSecrets((prev) => [...(prev ?? []), summary]);
        }

        const trimmedHint = hint.trim();
        if (!trimmedHint) {
            onClose();
            return;
        }
        setConfirming(true);
        try {
            const updated = await updateSecret({ uid: summary.uid, version: summary.version, hint: trimmedHint });
            // The verification step above always lists the secret before this can run, so `prev` is never null here.
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
                <form
                    onSubmit={handleConfirm}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}
                >
                    <p className="rr-hint" style={{ margin: 0 }}>
                        Scan this QR code with your authenticator app, or enter the code manually. You won&rsquo;t be able
                        to see this again.
                    </p>
                    <img src={setup.qrDataUrl} alt="Authenticator app QR code" width={180} height={180} />
                    <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{setup.secret}</code>
                    <FormField label="Verification code" htmlFor="totpVerifyCode">
                        <CodeInput id="totpVerifyCode" value={code} onChange={setCode} length={setup.digits} />
                    </FormField>
                    <p className="rr-hint" style={{ margin: 0 }}>
                        Enter the {setup.digits}-digit code your app now shows to confirm it&rsquo;s working. It isn&rsquo;t
                        added as a sign-in method until you do.
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
                    <Button
                        type="submit"
                        style={{ width: "auto" }}
                        loading={confirming}
                        disabled={confirming || code.length !== setup.digits}
                    >
                        Verify and add
                    </Button>
                </form>
            )}
        </div>
    );
}
