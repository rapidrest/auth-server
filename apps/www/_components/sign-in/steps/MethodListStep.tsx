import React from "react";
import Button from "../../buttons/Button.js";
import { CONTACT_TYPE_LABELS, FIXED_METHOD_LABELS, FixedMethod, MethodListItem, OtpHint } from "../types.js";

export interface MethodListStepProps {
    identifier: string;
    methodItems: MethodListItem[];
    onSelectFixed: (method: FixedMethod) => void;
    onSelectOtp: (hint: OtpHint) => void;
    onBack: () => void;
}

export default function MethodListStep({ identifier, methodItems, onSelectFixed, onSelectOtp, onBack }: MethodListStepProps) {
    return (
        <div>
            <div className="rr-card__title">Sign in</div>
            <p className="rr-card__subtitle">
                Choose how you&rsquo;d like to sign in as <strong>{identifier}</strong>.
            </p>

            {methodItems.length === 0 && (
                <p className="rr-hint" style={{ marginTop: 0 }}>
                    No sign-in methods are available for that account ID. Double-check it and try again.
                </p>
            )}

            {methodItems.length > 0 && (
                <div className="rr-method-list">
                    {methodItems.map((item) =>
                        item.kind === "fixed" ? (
                            <button
                                key={item.method}
                                type="button"
                                className="rr-method-list-item"
                                onClick={() => onSelectFixed(item.method)}
                            >
                                {FIXED_METHOD_LABELS[item.method]}
                                <span aria-hidden="true">&rsaquo;</span>
                            </button>
                        ) : (
                            <button
                                key={`otp-${item.hint.type}-${item.hint.contact}`}
                                type="button"
                                className="rr-method-list-item"
                                onClick={() => onSelectOtp(item.hint)}
                            >
                                {CONTACT_TYPE_LABELS[item.hint.type]}: {item.hint.contact}
                                <span aria-hidden="true">&rsaquo;</span>
                            </button>
                        ),
                    )}
                </div>
            )}

            <Button variant="text" type="button" style={{ marginTop: "1rem" }} onClick={onBack}>
                Use a different account
            </Button>
        </div>
    );
}
