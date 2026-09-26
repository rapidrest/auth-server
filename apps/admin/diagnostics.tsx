///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { PublicSiteSettings } from "../shared/lib/siteSettings.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import LogsCard from "../shared/components/admin/diagnostics/LogsCard.js";
import RuntimeCard from "../shared/components/admin/diagnostics/RuntimeCard.js";
import SystemCard from "../shared/components/admin/diagnostics/SystemCard.js";
import VersionsCard from "../shared/components/admin/diagnostics/VersionsCard.js";

interface DiagnosticsPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

type Tab = "versions" | "usage" | "logs";

const TABS: { id: Tab; label: string }[] = [
    { id: "versions", label: "Versions" },
    { id: "usage", label: "Live usage" },
    { id: "logs", label: "Service log" },
];

export default function DiagnosticsPage({ userUid, siteSettings }: DiagnosticsPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="diagnostics">
            <DiagnosticsContent />
        </AdminShell>
    );
}

/**
 * Only the selected tab is mounted, so the live-usage poll and the log stream run only while they're being looked
 * at (and switching back to a tab starts it afresh).
 */
function DiagnosticsContent() {
    const [tab, setTab] = useState<Tab>("versions");

    return (
        <>
            <div className="rr-card__title" style={{ marginBottom: "1rem" }}>
                Diagnostics
            </div>
            <p className="rr-hint" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
                What&apos;s deployed, how it&apos;s running, and what the service is logging &mdash; for troubleshooting
                this server and the pods around it.
            </p>

            <div className="rr-tabs" role="tablist" aria-label="Diagnostics" style={{ marginBottom: "1.5rem" }}>
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`diag-tab-${id}`}
                        aria-selected={tab === id}
                        aria-controls="diag-panel"
                        className={tab === id ? "rr-tab rr-tab--active" : "rr-tab"}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id="diag-panel" aria-labelledby={`diag-tab-${tab}`}>
                {tab === "versions" && (
                    <>
                        <div className="rr-section-title">Kubernetes</div>
                        <RuntimeCard />
                        <VersionsCard />
                    </>
                )}
                {tab === "usage" && <SystemCard />}
                {tab === "logs" && <LogsCard />}
            </div>
        </>
    );
}
