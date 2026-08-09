import React, { Dispatch, SetStateAction, useEffect, useState } from "react";
import { FiHardDrive, FiShield } from "react-icons/fi";
import Modal from "../../../lib/Modal.js";
import Button from "../../buttons/Button.js";
import { SecretSummary } from "../../../lib/api.js";
import TotpSecretForm from "../secrets/TotpSecretForm.js";
import Fido2SecretForm from "../secrets/Fido2SecretForm.js";

type MethodType = "totp" | "fido2" | null;

export interface RequireMfaSetupModalProps {
    open: boolean;
    setSecrets: Dispatch<SetStateAction<SecretSummary[] | null>>;
}

/**
 * Mandatory prompt shown whenever the account has `requireMFA: true` but no method the server's
 * `/auth/mfa` route would actually accept as a second factor yet (see `hasSecondFactor`). `open` is fully
 * derived by the caller from account state — but that state flips the moment `TotpSecretForm`/
 * `Fido2SecretForm` actually create the secret, which is *before* their own "here's your QR code, confirm
 * a label" step. Tracking visibility with local state (only ever opened *from* the `open` prop, never
 * closed by it) keeps this dialog on screen through that confirm step instead of yanking it out from under
 * the user the instant `hasSecondFactor` flips true — it only closes once the form itself calls `onClose`
 * (its own "Confirm" button). `Modal`'s built-in close button/backdrop/Escape handler is separately wired
 * to a no-op, since this dialog isn't meant to be dismissable any other way.
 *
 * Only `totp`/`fido2` are offered: a `passkey` secret, while a perfectly good primary sign-in method,
 * isn't one `MFAStrategy` accepts as a *second* factor (see `hasSecondFactor`'s doc comment), so offering
 * it here would let someone "complete" this prompt without it actually going away.
 */
export default function RequireMfaSetupModal({ open, setSecrets }: RequireMfaSetupModalProps) {
    const [visible, setVisible] = useState(open);
    const [methodType, setMethodType] = useState<MethodType>(null);

    useEffect(() => {
        if (open) setVisible(true);
    }, [open]);

    function handleClose() {
        setVisible(false);
        setMethodType(null);
    }

    return (
        <Modal open={visible} onClose={() => undefined} title="Two-factor authentication required">
            {!methodType && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <p className="rr-hint" style={{ marginTop: 0 }}>
                        This account requires a second sign-in method. Set one up now to continue.
                    </p>
                    <Button variant="secondary" type="button" onClick={() => setMethodType("totp")}>
                        <FiShield size={18} aria-hidden="true" />
                        Authenticator app
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => setMethodType("fido2")}>
                        <FiHardDrive size={18} aria-hidden="true" />
                        Hardware key (FIDO2, YubiKey)
                    </Button>
                </div>
            )}

            {methodType === "totp" && <TotpSecretForm setSecrets={setSecrets} onClose={handleClose} />}
            {methodType === "fido2" && <Fido2SecretForm setSecrets={setSecrets} onClose={handleClose} />}
        </Modal>
    );
}
