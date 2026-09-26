///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import type { DiagnosticsPvcMetrics } from "./diagnosticsApi.js";
import { formatBytes, NO_VALUE, percentOf } from "./format.js";
import UsageMeter from "./UsageMeter.js";

const HEADINGS = ["Volume", "Phase", "Storage class", "Size", "Usage"];

function Usage({ pvc }: { pvc: DiagnosticsPvcMetrics }) {
    if (!pvc.mountedByServer) {
        return <span className="rr-diag-muted">Usage not available: not mounted in the server pod.</span>;
    }
    const percent = percentOf(pvc.usedBytes, pvc.capacityBytes);
    if (percent === undefined) {
        return <span className="rr-diag-muted">The server has no usage figures for this volume.</span>;
    }
    return (
        <div>
            <UsageMeter
                label={`Usage of volume ${pvc.name}`}
                percent={percent}
                detail={`${formatBytes(pvc.usedBytes)} of ${formatBytes(pvc.capacityBytes)}`}
                flag={!pvc.sharesNodeDisk}
            />
            {pvc.sharesNodeDisk && <p className="rr-diag-status">Shares the node&rsquo;s disk; the volume&rsquo;s size is not enforced.</p>}
        </div>
    );
}

/** The deployment's persistent volume claims, with a usage bar for the ones the server can measure. */
export default function PvcTable({ pvcs }: { pvcs: DiagnosticsPvcMetrics[] }) {
    return (
        <section aria-labelledby="diagnostics-pvc-heading" className="rr-diag-section">
            <h2 id="diagnostics-pvc-heading" className="rr-diag-section__title">
                Persistent volumes
            </h2>
            {pvcs.length === 0 ? (
                <p className="rr-diag-muted">This deployment has no persistent volume claims.</p>
            ) : (
                <div className="rr-diag-scroll">
                    <table className="rr-diag-table">
                        <thead>
                            <tr>
                                {HEADINGS.map((heading) => (
                                    <th key={heading}>{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pvcs.map((pvc) => (
                                <tr key={pvc.name}>
                                    <td className="rr-diag-mono rr-diag-break">{pvc.name}</td>
                                    <td>{pvc.phase}</td>
                                    <td>{pvc.storageClass ?? NO_VALUE}</td>
                                    <td className="rr-diag-num">{formatBytes(pvc.capacityBytes ?? pvc.requestedBytes)}</td>
                                    <td className="rr-diag-table__usage">
                                        <Usage pvc={pvc} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
