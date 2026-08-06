import React, { FormEvent } from "react";
import Modal from "../../../_lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";

export interface ChangeUsernameModalProps {
    open: boolean;
    onClose: () => void;
    value: string;
    setValue: (value: string) => void;
    error: string | null;
    saving: boolean;
    onSubmit: (e: FormEvent) => void;
}

export default function ChangeUsernameModal({
    open,
    onClose,
    value,
    setValue,
    error,
    saving,
    onSubmit,
}: ChangeUsernameModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Change username">
            {error && <Alert>{error}</Alert>}
            <form onSubmit={onSubmit}>
                <FormField label="Username" htmlFor="usernameChange">
                    <input
                        id="usernameChange"
                        className="rr-input"
                        type="text"
                        required
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving} style={{ width: "auto" }}>
                    Save
                </Button>
            </form>
        </Modal>
    );
}
