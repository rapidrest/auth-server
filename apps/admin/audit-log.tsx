///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import { ApiRequestError } from "../shared/lib/api.js";
import { AuditLogEntry, listAuditLog } from "../shared/lib/adminApi.js";
import { auditLogEventLabel, auditLogTypeLabel, formatAuditLogData, KNOWN_AUDIT_LOG_TYPES } from "../shared/lib/auditLog.js";
import { PublicSiteSettings } from "../shared/lib/siteSettings.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import Alert from "../shared/components/feedback/Alert.js";
import Button from "../shared/components/buttons/Button.js";

const PAGE_SIZE = 25;

interface AuditLogPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function AuditLogPage({ userUid, siteSettings }: AuditLogPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="audit-log">
            <AuditLogContent />
        </AdminShell>
    );
}

interface AuditLogFilters {
    userUid: string;
    type: string;
}

const DEFAULT_AUDIT_LOG_FILTERS: AuditLogFilters = { userUid: "", type: "" };

/**
 * Filter state seeded from the current URL's query string on first render — `?userUid=<uid>` is how
 * `UserActivityCard`'s "View all" link deep-links here already scoped to one account. Only read once, on
 * mount (this component is never re-rendered for a different URL without a full page navigation, which
 * would remount it anyway).
 */
function readInitialFilters(): AuditLogFilters {
    const params = new URLSearchParams(window.location.search);
    return {
        userUid: params.get("userUid") ?? "",
        type: params.get("type") ?? "",
    };
}

function formatDateTime(iso: string | undefined): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

function AuditLogContent() {
    const [filters, setFilters] = useState<AuditLogFilters>(readInitialFilters);
    // Local, uncommitted copies of the filter inputs — applied to `filters` (and therefore to the request)
    // only on submit, mirroring UserSearchBar's search-on-submit convention for the main Users list.
    const [userUidInput, setUserUidInput] = useState(filters.userUid);
    const [typeInput, setTypeInput] = useState(filters.type);

    const [page, setPage] = useState(0);
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        listAuditLog({
            userUid: filters.userUid.trim() || undefined,
            type: filters.type || undefined,
            page,
            limit: PAGE_SIZE,
        })
            .then(setEntries)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load the audit log."))
            .finally(() => setLoading(false));
    }, [filters, page]);

    function handleFilterSubmit(e: FormEvent) {
        e.preventDefault();
        setPage(0);
        setFilters({ userUid: userUidInput, type: typeInput });
    }

    const hasNextPage = entries.length === PAGE_SIZE;

    return (
        <>
            <div className="rr-card__title" style={{ marginBottom: "1rem" }}>
                Audit Log
            </div>
            <p className="rr-hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                A durable record of security-relevant events across every account: sign-ins, account deletion,
                elevation, MFA and password changes, and more.
            </p>

            <form
                onSubmit={handleFilterSubmit}
                style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}
            >
                <div className="rr-field" style={{ flex: "2 1 240px", marginBottom: 0 }}>
                    <label htmlFor="auditLogUserUid">Account</label>
                    <input
                        id="auditLogUserUid"
                        className="rr-input"
                        type="text"
                        placeholder="account uid"
                        value={userUidInput}
                        onChange={(e) => setUserUidInput(e.target.value)}
                    />
                </div>
                <div className="rr-field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
                    <label htmlFor="auditLogType">Event</label>
                    <select id="auditLogType" className="rr-input" value={typeInput} onChange={(e) => setTypeInput(e.target.value)}>
                        <option value="">Any</option>
                        {KNOWN_AUDIT_LOG_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {auditLogTypeLabel(type)}
                            </option>
                        ))}
                    </select>
                </div>
                <Button type="submit" variant="secondary" style={{ width: "auto" }} loading={loading} disabled={loading}>
                    Filter
                </Button>
            </form>

            {error && <Alert>{error}</Alert>}

            {loading ? (
                <p className="rr-hint">Loading&hellip;</p>
            ) : entries.length === 0 ? (
                <p className="rr-hint">No activity found.</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Event</th>
                                <th>Account</th>
                                <th>Actor</th>
                                <th>IP</th>
                                <th>Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => {
                                const detail = formatAuditLogData(entry.data);
                                return (
                                    <tr key={entry.uid}>
                                        <td>{formatDateTime(entry.dateCreated)}</td>
                                        <td>{auditLogEventLabel(entry)}</td>
                                        <td>
                                            {entry.userUid ? (
                                                <a href={`/admin/users/${encodeURIComponent(entry.userUid)}`}>{entry.userUid}</a>
                                            ) : (
                                                <span className="rr-hint">&mdash;</span>
                                            )}
                                        </td>
                                        <td>
                                            {entry.actorUid && entry.actorUid !== entry.userUid ? (
                                                <>
                                                    by{" "}
                                                    <a href={`/admin/users/${encodeURIComponent(entry.actorUid)}`}>{entry.actorUid}</a>
                                                </>
                                            ) : (
                                                <span className="rr-hint">&mdash;</span>
                                            )}
                                        </td>
                                        <td>{entry.ip || <span className="rr-hint">&mdash;</span>}</td>
                                        <td>{detail || <span className="rr-hint">&mdash;</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                    Previous
                </Button>
                <span className="rr-hint">Page {page + 1}</span>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={!hasNextPage || loading}
                    onClick={() => setPage((p) => p + 1)}
                >
                    Next
                </Button>
            </div>
        </>
    );
}
