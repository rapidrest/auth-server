///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import Modal from "../../../lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import { AdminClient } from "../../../lib/adminApi.js";

export interface DeleteClientModalProps {
    open: boolean;
    onClose: () => void;
    client: AdminClient | null;
    onConfirm: (purge: boolean) => void;
    deleting?: boolean;
    error?: string | null;
}

export default function DeleteClientModal({ open, onClose, client, onConfirm, deleting, error }: DeleteClientModalProps) {
    const [purge, setPurge] = useState(false);

    if (!client) {
        return null;
    }

    return (
        <Modal open={open} onClose={onClose} title="Delete client">
            {error && <Alert>{error}</Alert>}
            <p>
                Are you sure you want to delete <strong>{client.clientName}</strong> (
                <span style={{ fontFamily: "monospace" }}>{client.clientId}</span>)? Any tokens it has already
                issued will stop working once they expire.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
                Permanently erase (cannot be undone)
            </label>
            <div style={{ display: "flex", gap: "0.75rem" }}>
                <Button
                    type="button"
                    variant="primary"
                    style={{ width: "auto" }}
                    loading={deleting}
                    disabled={deleting}
                    onClick={() => onConfirm(purge)}
                >
                    Delete
                </Button>
                <Button type="button" variant="secondary" style={{ width: "auto" }} onClick={onClose} disabled={deleting}>
                    Cancel
                </Button>
            </div>
        </Modal>
    );
}
