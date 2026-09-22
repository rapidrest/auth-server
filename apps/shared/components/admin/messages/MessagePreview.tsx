///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { RenderedMessage } from "../../../lib/messagingApi.js";

export interface MessagePreviewProps {
    rendered: RenderedMessage;
}

const PRE_STYLE: React.CSSProperties = {
    margin: 0,
    padding: "0.75rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "inherit",
    border: "1px solid var(--rr-color-border)",
    borderRadius: "var(--rr-radius-md)",
};

/**
 * What a template renders to, as a real send would produce it (real branding, a sample code). The HTML part is
 * shown in a fully sandboxed frame — no scripts, no forms, no navigation — since it's markup an admin typed, and
 * this is the admin console. A WhatsApp message is either the free-form text or, for an approved WhatsApp template, its
 * name and language followed by each parameter it's filled with, exactly as the server describes it.
 */
export default function MessagePreview({ rendered }: MessagePreviewProps) {
    return (
        <div>
            <div className="rr-card__title" style={{ fontSize: "1rem" }}>
                E-mail
            </div>
            {rendered.subject === null ? (
                <p className="rr-hint">This e-mail would not be sent: it has no subject.</p>
            ) : (
                <>
                    <p style={{ marginTop: 0 }}>
                        <strong>Subject:</strong> {rendered.subject}
                    </p>
                    {rendered.html !== null && (
                        <iframe
                            title="HTML e-mail preview"
                            sandbox=""
                            srcDoc={rendered.html}
                            style={{
                                width: "100%",
                                height: 380,
                                border: "1px solid var(--rr-color-border)",
                                borderRadius: "var(--rr-radius-md)",
                                background: "#ffffff",
                            }}
                        />
                    )}
                    {rendered.text !== null && (
                        <>
                            <p className="rr-hint" style={{ marginBottom: "0.25rem" }}>
                                Plain-text version
                            </p>
                            <pre style={PRE_STYLE}>{rendered.text}</pre>
                        </>
                    )}
                </>
            )}

            <div className="rr-card__title" style={{ fontSize: "1rem", marginTop: "1.25rem" }}>
                Text message
            </div>
            {rendered.sms === null ? (
                <p className="rr-hint">This text message would not be sent: it is empty.</p>
            ) : (
                <>
                    <pre style={PRE_STYLE}>{rendered.sms}</pre>
                    <p className="rr-hint">{rendered.sms.length} characters</p>
                </>
            )}

            <div className="rr-card__title" style={{ fontSize: "1rem", marginTop: "1.25rem" }}>
                WhatsApp message
            </div>
            {rendered.whatsapp === null ? (
                <p className="rr-hint">This WhatsApp message would not be sent: it is empty.</p>
            ) : (
                <pre style={PRE_STYLE}>{rendered.whatsapp}</pre>
            )}
        </div>
    );
}
