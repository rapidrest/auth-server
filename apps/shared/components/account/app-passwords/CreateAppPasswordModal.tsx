///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { Dispatch, FormEvent, SetStateAction, useState } from "react";
import Modal from "../../../lib/Modal.js";
import { ApiRequestError, CreatedAppPasswordSecret, createAppPasswordSecret, SecretSummary } from "../../../lib/api.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface CreateAppPasswordModalProps {
    open: boolean;
    onClose: () => void;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
}

/** The list-safe part of a just-created app password — leaves out `password`, the plaintext, so it never sits in shared list state. */
function toSummary(created: CreatedAppPasswordSecret): SecretSummary {
    return {
        uid: created.uid,
        version: created.version,
        type: created.type,
        userUid: created.userUid,
        dateCreated: created.dateCreated,
        hint: created.hint,
    };
}

interface CreateAppPasswordFormProps {
    onClose: () => void;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
}

/**
 * The form half of `CreateAppPasswordModal`, split out so its state (typed label, any generated password, any
 * error) is unmounted — and so reset — whenever `Modal` closes, rather than lingering into the next time it opens.
 */
function CreateAppPasswordForm({ onClose, setSecrets }: CreateAppPasswordFormProps) {
    const [hint, setHint] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // The freshly created secret, plaintext and all, while it's still on screen. Never handed to `setSecrets`
    // until "Done" — see the module doc comment on `CreateAppPasswordModal` below for why.
    const [created, setCreated] = useState<CreatedAppPasswordSecret | null>(null);

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        const trimmedHint = hint.trim();
        if (!trimmedHint) {
            return;
        }
        setError(null);
        setCreating(true);
        try {
            setCreated(await createAppPasswordSecret(trimmedHint));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not create an app password.");
        } finally {
            setCreating(false);
        }
    }

    function handleDone() {
        // Only reachable via the button below, which only renders once `created` exists.
        setSecrets((prev) => [...(prev ?? []), toSummary(created)]);
        onClose();
    }

    if (created) {
        return (
            <div>
                <p className="rr-hint" style={{ marginTop: 0 }}>
                    Copy this password now. You won&rsquo;t be able to see it again — if it&rsquo;s lost, remove this
                    app password and create a new one.
                </p>
                <code style={{ display: "block", fontSize: "0.85rem", wordBreak: "break-all", marginBottom: "1rem" }}>
                    {created.password}
                </code>
                <Button type="button" style={{ width: "auto" }} onClick={handleDone}>
                    Done
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleCreate}>
            {error && <Alert>{error}</Alert>}
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Give this app password a label so you can tell it apart from others later, e.g. the app or device
                it&rsquo;s for.
            </p>
            <FormField label="Label" htmlFor="appPasswordHint">
                <input
                    id="appPasswordHint"
                    className="rr-input"
                    type="text"
                    placeholder="e.g. Mail app on my laptop"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                />
            </FormField>
            <Button type="submit" style={{ width: "auto" }} loading={creating} disabled={creating || !hint.trim()}>
                Create
            </Button>
        </form>
    );
}

/**
 * Creates a new app password (see `AppPasswordsCard`'s doc comment for what these are for). Unlike every
 * other secret type this account page adds, an app password needs no verification/proof step — it's a
 * server-generated random value, good the instant it's created — so the flow is simpler than
 * `TotpSecretForm`/`PasskeySecretForm`: collect the (required) label first, since the server won't create one
 * without it, then show the generated plaintext exactly once, the same "shown once, plain selectable `<code>`
 * text, no copy-to-clipboard" contract `RevealSecretModal` documents.
 *
 * The new secret's summary is only added to the shared `secrets` list once "Done" is clicked — not the moment
 * it's created — so the plaintext step has already been shown before the row appears in `AppPasswordsCard`'s
 * table below.
 */
export default function CreateAppPasswordModal({ open, onClose, setSecrets }: CreateAppPasswordModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Add an app password">
            <CreateAppPasswordForm onClose={onClose} setSecrets={setSecrets} />
        </Modal>
    );
}
