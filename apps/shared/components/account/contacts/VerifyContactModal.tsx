import React, { FormEvent } from "react";
import Modal from "../../../lib/Modal.js";
import Alert from "../../feedback/Alert.js";
import FormField from "../../forms/FormField.js";
import CodeInput from "../../forms/CodeInput.js";
import Button from "../../buttons/Button.js";
import { Contact } from "../../../lib/api.js";

export interface VerifyContactModalProps {
    open: boolean;
    onClose: () => void;
    contact: Contact | null;
    code: string;
    setCode: (value: string) => void;
    saving: boolean;
    error: string | null;
    resending: boolean;
    resent: boolean;
    onSubmit: (e: FormEvent) => void;
    onResend: () => void;
}

export default function VerifyContactModal({
    open,
    onClose,
    contact,
    code,
    setCode,
    saving,
    error,
    resending,
    resent,
    onSubmit,
    onResend,
}: VerifyContactModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Verify contact">
            <p className="rr-hint" style={{ marginTop: 0 }}>
                We sent a code to {contact?.contact}.
            </p>
            {error && <Alert>{error}</Alert>}
            <form onSubmit={onSubmit}>
                <FormField label="Verification code" htmlFor="verifyCode">
                    <CodeInput id="verifyCode" value={code} onChange={setCode} />
                </FormField>
                <Button type="submit" loading={saving} disabled={saving} style={{ width: "auto" }}>
                    Verify
                </Button>
            </form>
            <div className="rr-footer-link">
                Didn&rsquo;t get a code?{" "}
                <Button variant="text" type="button" onClick={onResend} disabled={resending}>
                    Resend
                </Button>
                {resent && (
                    <span className="rr-hint" style={{ marginLeft: "0.5rem" }}>
                        Sent.
                    </span>
                )}
            </div>
        </Modal>
    );
}
