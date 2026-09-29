///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import Modal from "../../../lib/Modal.js";
import Button from "../../buttons/Button.js";
import CopyIconButton from "../../buttons/CopyIconButton.js";

export interface RevealSecretModalProps {
    open: boolean;
    onClose: () => void;
    clientSecret: string | null;
}

/**
 * Displays a freshly generated (or regenerated) client secret in plaintext, exactly once — the same
 * "shown once, plain selectable `<code>` text" contract `TotpSecretForm` already uses for a TOTP secret,
 * with a copy button at the end of it. There is no way to see this value again once the modal is closed: the server
 * never returns `clientSecretHash` on an ordinary read (see `BaseOAuthClientRoute`).
 */
export default function RevealSecretModal({ open, onClose, clientSecret }: RevealSecretModalProps) {
    if (!clientSecret) {
        return null;
    }

    return (
        <Modal open={open} onClose={onClose} title="Client secret">
            <p className="rr-hint" style={{ marginTop: 0 }}>
                Copy this secret now. You won&rsquo;t be able to see it again — if it&rsquo;s lost, generate a new
                one from this client&rsquo;s detail page.
            </p>
            <div className="rr-copy-row">
                <code>{clientSecret}</code>
                <CopyIconButton value={clientSecret} />
            </div>
            <div className="rr-modal__actions">
                <Button type="button" style={{ width: "auto" }} onClick={onClose}>
                    Done
                </Button>
            </div>
        </Modal>
    );
}
