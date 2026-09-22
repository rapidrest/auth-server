///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { MessageTemplateSummary } from "../../../lib/messagingApi.js";

export interface TemplateTableProps {
    templates: MessageTemplateSummary[];
}

/** Where a template is edited. Its name is a URL segment, so it's encoded like any other. */
export function templateHref(name: string): string {
    return `/admin/messages/${encodeURIComponent(name)}`;
}

/** The e-mails, text messages and WhatsApp messages this server sends, one row each, with whether each has been customized. */
export default function TemplateTable({ templates }: TemplateTableProps) {
    if (templates.length === 0) {
        return <p className="rr-hint">No messages found.</p>;
    }

    return (
        <div style={{ overflowX: "auto" }}>
            <table className="rr-table">
                <thead>
                    <tr>
                        <th>Message</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {templates.map((template) => (
                        <tr key={template.name}>
                            <td>
                                <div>{template.title || template.name}</div>
                                {template.description && <div className="rr-hint">{template.description}</div>}
                            </td>
                            <td>
                                <span className={"rr-badge" + (template.customized ? " rr-badge--success" : "")}>
                                    {template.customized ? "Customized" : "Default"}
                                </span>
                                {!template.enabled && (
                                    <span className="rr-badge" style={{ marginLeft: "0.5rem" }}>
                                        Off
                                    </span>
                                )}
                            </td>
                            <td>
                                <a href={templateHref(template.name)}>Edit</a>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
