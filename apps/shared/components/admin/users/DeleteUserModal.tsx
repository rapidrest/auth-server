import React, { useState } from "react";
import Modal from "../../../lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import { AdminUser } from "../../../lib/adminApi.js";

export interface DeleteUserModalProps {
    open: boolean;
    onClose: () => void;
    user: AdminUser | null;
    onConfirm: (purge: boolean) => void;
    deleting?: boolean;
    error?: string | null;
}

export default function DeleteUserModal({ open, onClose, user, onConfirm, deleting, error }: DeleteUserModalProps) {
    const [purge, setPurge] = useState(false);

    if (!user) {
        return null;
    }

    return (
        <Modal open={open} onClose={onClose} title="Delete account">
            {error && <Alert>{error}</Alert>}
            <p>
                Are you sure you want to delete account <strong style={{ fontFamily: "monospace" }}>{user.uid}</strong>?
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
