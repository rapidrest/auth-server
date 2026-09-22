///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../../lib/api.js";
import { AuditLogEntry, listAuditLog } from "../../../../lib/adminApi.js";
import { auditLogEventLabel, formatAuditLogData } from "../../../../lib/auditLog.js";
import Alert from "../../../feedback/Alert.js";

export interface UserActivityCardProps {
    uid: string;
}

/** The most recent activity shown inline on the account page before linking out to the full, filterable log. */
const RECENT_LIMIT = 10;

function formatDateTime(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

/**
 * The last `RECENT_LIMIT` security audit log entries for this account (sign-ins, password/MFA changes,
 * admin actions taken on it, etc.) — a preview of `/admin/audit-log?userUid=<uid>`, which "View all" links
 * to. No Account column here (unlike the full log's table): it's implicit, this card is already scoped to
 * one account.
 */
export default function UserActivityCard({ uid }: UserActivityCardProps) {
    const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listAuditLog({ userUid: uid, limit: RECENT_LIMIT })
            .then(setEntries)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this account's recent activity."));
    }, [uid]);

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div className="rr-card__title">Recent activity</div>
                    <p className="rr-card__subtitle">Sign-ins and other security-relevant events on this account.</p>
                </div>
                <a href={`/admin/audit-log?userUid=${encodeURIComponent(uid)}`}>View all</a>
            </div>
            {error && <Alert>{error}</Alert>}
            {entries !== null && entries.length === 0 && <p className="rr-hint">No activity recorded yet.</p>}
            {entries && entries.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Event</th>
                                <th>Actor</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => {
                                const detail = formatAuditLogData(entry.data);
                                return (
                                    <tr key={entry.uid}>
                                        <td>{formatDateTime(entry.dateCreated)}</td>
                                        <td>
                                            {auditLogEventLabel(entry)}
                                            {detail && (
                                                <span className="rr-hint" style={{ marginLeft: "0.4rem" }}>
                                                    ({detail})
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {entry.actorUid && entry.actorUid !== entry.userUid ? (
                                                <a href={`/admin/users/${encodeURIComponent(entry.actorUid)}`}>{entry.actorUid}</a>
                                            ) : (
                                                <span className="rr-hint">&mdash;</span>
                                            )}
                                        </td>
                                        <td>{entry.ip || <span className="rr-hint">&mdash;</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
