///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import type { DiagnosticsVersions } from "./diagnosticsApi.js";
import { formatDateTime, formatUptime, NO_VALUE } from "./format.js";

/** The server process: Node.js, the deployed package, the machine and how long it has been up. */
export default function ServerVersionCard({ server }: { server: DiagnosticsVersions["server"] }) {
    const rows: [string, string][] = [
        ["Node.js", server.nodeVersion || NO_VALUE],
        ["V8", server.v8Version || NO_VALUE],
        ["Package", server.packageName ? `${server.packageName} ${server.packageVersion ?? ""}`.trim() : NO_VALUE],
        ["Environment", server.nodeEnv || NO_VALUE],
        ["Platform", [server.platform, server.arch].filter(Boolean).join(" / ") || NO_VALUE],
        ["Host name", server.hostname || NO_VALUE],
        ["Process ID", server.pid === undefined ? NO_VALUE : String(server.pid)],
        ["Started", formatDateTime(server.startedAt)],
        ["Up for", formatUptime(server.uptimeSeconds)],
    ];
    return (
        <section aria-labelledby="diagnostics-server-heading" className="rr-diag-section">
            <h2 id="diagnostics-server-heading" className="rr-diag-section__title">
                Server
            </h2>
            <dl className="rr-diag-facts">
                {rows.map(([term, description]) => (
                    <div key={term}>
                        <dt>{term}</dt>
                        <dd>{description}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
