import React, { FormEvent } from "react";
import Modal from "../../../_lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import Button from "../../buttons/Button.js";
import { RegistrationIdentifierType } from "../../../_lib/api.js";

export interface AddContactModalProps {
    open: boolean;
    onClose: () => void;
    error: string | null;
    adding: boolean;
    type: RegistrationIdentifierType;
    setType: (type: RegistrationIdentifierType) => void;
    value: string;
    setValue: (value: string) => void;
    onSubmit: (e: FormEvent) => void;
}

export default function AddContactModal({
    open,
    onClose,
    error,
    adding,
    type,
    setType,
    value,
    setValue,
    onSubmit,
}: AddContactModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Add a contact">
            {error && <Alert>{error}</Alert>}
            <form onSubmit={onSubmit}>
                <FormField label="Type" htmlFor="newContactType">
                    <select
                        id="newContactType"
                        className="rr-input"
                        value={type}
                        onChange={(e) => setType(e.target.value as RegistrationIdentifierType)}
                    >
                        <option value="email">E-mail</option>
                        <option value="phone">Phone</option>
                    </select>
                </FormField>
                <FormField label={type === "email" ? "E-mail address" : "Phone number"} htmlFor="newContactValue">
                    <input
                        id="newContactValue"
                        className="rr-input"
                        type="text"
                        required
                        placeholder={type === "email" ? "you@example.com" : "+1 555 123 4567"}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                </FormField>
                <Button type="submit" loading={adding} disabled={adding} style={{ width: "auto" }}>
                    Add
                </Button>
            </form>
        </Modal>
    );
}
