import React from "react";
import Modal from "../../../lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface DeleteAccountModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    deleting?: boolean;
    error?: string | null;
}

export default function DeleteAccountModal({ open, onClose, onConfirm, deleting, error }: DeleteAccountModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Delete account">
            {error && <Alert>{error}</Alert>}
            <p>
                Are you sure you want to delete your account? This permanently removes your profile, contacts, and
                sign-in methods. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
                <Button
                    type="button"
                    variant="primary"
                    style={{ width: "auto" }}
                    loading={deleting}
                    disabled={deleting}
                    onClick={onConfirm}
                >
                    Delete my account
                </Button>
                <Button type="button" variant="secondary" style={{ width: "auto" }} onClick={onClose} disabled={deleting}>
                    Cancel
                </Button>
            </div>
        </Modal>
    );
}
