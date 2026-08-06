import React, { Dispatch, SetStateAction } from "react";
import { FiHardDrive, FiKey, FiLock, FiShield } from "react-icons/fi";
import Modal from "../../../_lib/Modal.js";
import Button from "../../buttons/Button.js";
import { SecretSummary, SecretType } from "../../../_lib/api.js";
import PasswordSecretForm from "./PasswordSecretForm.js";
import TotpSecretForm from "./TotpSecretForm.js";
import PasskeySecretForm from "./PasskeySecretForm.js";
import Fido2SecretForm from "./Fido2SecretForm.js";

export type AddMethodType = SecretType | null;

export interface AddSecretModalProps {
    open: boolean;
    onClose: () => void;
    addMethodType: AddMethodType;
    setAddMethodType: Dispatch<SetStateAction<AddMethodType>>;
    secrets: SecretSummary[] | null;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
}

export default function AddSecretModal({
    open,
    onClose,
    addMethodType,
    setAddMethodType,
    secrets,
    setSecrets,
}: AddSecretModalProps) {
    return (
        <Modal open={open} onClose={onClose} title="Add a sign-in method">
            {!addMethodType && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Button variant="secondary" type="button" onClick={() => setAddMethodType("password")}>
                        <FiLock size={18} aria-hidden="true" />
                        Password
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setAddMethodType("totp")}>
                        <FiShield size={18} aria-hidden="true" />
                        Authenticator app
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setAddMethodType("passkey")}>
                        <FiKey size={18} aria-hidden="true" />
                        Passkey
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setAddMethodType("fido2")}>
                        <FiHardDrive size={18} aria-hidden="true" />
                        Hardware key (e.g. YubiKey)
                    </Button>
                </div>
            )}

            {addMethodType === "password" && <PasswordSecretForm secrets={secrets} setSecrets={setSecrets} onClose={onClose} />}
            {addMethodType === "totp" && <TotpSecretForm setSecrets={setSecrets} onClose={onClose} />}
            {addMethodType === "passkey" && <PasskeySecretForm setSecrets={setSecrets} onClose={onClose} />}
            {addMethodType === "fido2" && <Fido2SecretForm setSecrets={setSecrets} onClose={onClose} />}
        </Modal>
    );
}
