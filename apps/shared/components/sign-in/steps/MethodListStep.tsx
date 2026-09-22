///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { FiHardDrive, FiKey, FiLock, FiMail, FiMessageCircle, FiPhone, FiShield } from "react-icons/fi";
import Button from "../../buttons/Button.js";
import { FIXED_METHOD_LABELS, FixedMethod, MethodListItem, OtpHint, otpHintKey, otpHintLabel } from "../types.js";

export interface MethodListStepProps {
    identifier: string;
    methodItems: MethodListItem[];
    onSelectFixed: (method: FixedMethod) => void;
    onSelectOtp: (hint: OtpHint) => void;
    onBack: () => void;
}

const FIXED_METHOD_ICONS: Record<FixedMethod, React.ReactElement> = {
    passkey: <FiKey size={18} aria-hidden="true" />,
    password: <FiLock size={18} aria-hidden="true" />,
    totp: <FiShield size={18} aria-hidden="true" />,
    fido2: <FiHardDrive size={18} aria-hidden="true" />,
};

const CONTACT_TYPE_ICONS: Record<OtpHint["type"], React.ReactElement> = {
    email: <FiMail size={18} aria-hidden="true" />,
    phone: <FiPhone size={18} aria-hidden="true" />,
};

// A WhatsApp hint is still a `phone` hint, so it's picked by `channel` rather than looked up by type.
const WHATSAPP_ICON = <FiMessageCircle size={18} aria-hidden="true" />;

export default function MethodListStep({ identifier, methodItems, onSelectFixed, onSelectOtp, onBack }: MethodListStepProps) {
    return (
        <div>
            <div className="rr-card__title">Sign in</div>
            <p className="rr-card__subtitle">
                Choose how you&rsquo;d like to sign in as <strong>{identifier}</strong>.
            </p>

            {/* SignInFlow redirects to sign-up before this step is ever reached with an empty list. */}
            <div className="rr-method-list">
                {methodItems.map((item) =>
                    item.kind === "fixed" ? (
                        <button
                            key={item.method}
                            type="button"
                            className="rr-method-list-item"
                            onClick={() => onSelectFixed(item.method)}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                {FIXED_METHOD_ICONS[item.method]}
                                {FIXED_METHOD_LABELS[item.method]}
                            </span>
                            <span aria-hidden="true">&rsaquo;</span>
                        </button>
                    ) : (
                        <button
                            key={otpHintKey(item.hint)}
                            type="button"
                            className="rr-method-list-item"
                            onClick={() => onSelectOtp(item.hint)}
                        >
                            <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                {item.hint.channel === "whatsapp" ? WHATSAPP_ICON : CONTACT_TYPE_ICONS[item.hint.type]}
                                {otpHintLabel(item.hint)}: {item.hint.contact}
                            </span>
                            <span aria-hidden="true">&rsaquo;</span>
                        </button>
                    ),
                )}
            </div>

            <Button variant="text" type="button" style={{ marginTop: "1rem" }} onClick={onBack}>
                Use a different account
            </Button>
        </div>
    );
}
