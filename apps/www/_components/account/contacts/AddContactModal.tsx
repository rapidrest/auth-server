import React, { FormEvent } from "react";
import { FiMail, FiPhone } from "react-icons/fi";
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

const CONTACT_TYPE_TABS: { type: RegistrationIdentifierType; label: string; icon: React.ReactElement }[] = [
    { type: "email", label: "E-mail", icon: <FiMail size={18} aria-hidden="true" /> },
    { type: "phone", label: "Phone", icon: <FiPhone size={18} aria-hidden="true" /> },
];

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
                <div className="rr-field">
                    <label id="newContactTypeLabel">Type</label>
                    <div className="rr-tabs" role="group" aria-labelledby="newContactTypeLabel">
                        {CONTACT_TYPE_TABS.map((tab) => (
                            <button
                                key={tab.type}
                                type="button"
                                className={"rr-tab" + (type === tab.type ? " rr-tab--active" : "")}
                                aria-pressed={type === tab.type}
                                onClick={() => setType(tab.type)}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
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
