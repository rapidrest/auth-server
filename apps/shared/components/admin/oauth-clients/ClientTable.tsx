///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { AdminClient } from "../../../lib/adminApi.js";
import Button from "../../buttons/Button.js";

export interface ClientTableProps {
    clients: AdminClient[];
    onDelete: (client: AdminClient) => void;
}

function formatDate(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return iso;
    }
}

function ChipList({ values }: { values: string[] }) {
    if (values.length === 0) {
        return <span className="rr-hint">&mdash;</span>;
    }
    return (
        <div className="rr-chips" style={{ marginBottom: 0 }}>
            {values.map((value) => (
                <span className="rr-chip" key={value}>
                    {value}
                </span>
            ))}
        </div>
    );
}

export default function ClientTable({ clients, onDelete }: ClientTableProps) {
    if (clients.length === 0) {
        return <p className="rr-hint">No clients found.</p>;
    }

    return (
        <div style={{ overflowX: "auto" }}>
            <table className="rr-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Scope</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {clients.map((client) => (
                        <tr key={client.uid}>
                            <td>
                                <div>{client.clientName}</div>
                                <div className="rr-hint" style={{ fontFamily: "monospace" }}>
                                    {client.clientId}
                                </div>
                            </td>
                            <td>
                                <span className={"rr-badge" + (client.clientType === "confidential" ? " rr-badge--success" : "")}>
                                    {client.clientType === "confidential" ? "Confidential" : "Public"}
                                </span>
                                {client.firstParty && (
                                    <span className="rr-badge" style={{ marginLeft: "0.5rem" }}>
                                        First-party
                                    </span>
                                )}
                            </td>
                            <td>
                                <ChipList values={client.scope ? client.scope.split(" ").filter(Boolean) : []} />
                            </td>
                            <td>
                                <span className={"rr-badge" + (client.disabled ? "" : " rr-badge--success")}>
                                    {client.disabled ? "Disabled" : "Enabled"}
                                </span>
                            </td>
                            <td>{formatDate(client.dateCreated)}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                                <a href={`/admin/oauth-clients/${encodeURIComponent(client.uid)}`}>View</a>
                                <Button variant="text" type="button" onClick={() => onDelete(client)} style={{ marginLeft: "0.75rem" }}>
                                    Delete
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
