///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { HiOutlineInformationCircle } from "react-icons/hi2";
import type { DiagnosticsMetrics } from "./diagnosticsApi.js";
import { formatBytes, formatCores, NO_VALUE } from "./format.js";
import { seriesOf } from "./metricsHistory.js";
import MetricTile from "./MetricTile.js";

type NamespaceMetrics = NonNullable<DiagnosticsMetrics["kubernetes"]["namespace"]>;

export interface NamespaceCardProps {
    namespace: NamespaceMetrics | undefined;
    history: DiagnosticsMetrics[];
}

const POD_HEADINGS = ["Pod", "Component", "CPU", "Memory"];

/**
 * The deployment's namespace: what all its pods use together, and what each pod uses. The figures come from metrics-server;
 * without it there are none, and that is said as a hint (it is a choice of the cluster), not as a failure.
 */
export default function NamespaceCard({ namespace, history }: NamespaceCardProps) {
    // Biggest memory first; a pod with no figure last.
    const pods = [...(namespace?.pods ?? [])].sort((a, b) => (b.memoryUsedBytes ?? -1) - (a.memoryUsedBytes ?? -1));
    return (
        <section aria-labelledby="diagnostics-namespace-heading" className="rr-diag-section">
            <h2 id="diagnostics-namespace-heading" className="rr-diag-section__title">
                Namespace{namespace?.name ? ` ${namespace.name}` : ""}
            </h2>
            {!namespace ? (
                <p className="rr-diag-muted">The server did not report the namespace&rsquo;s figures.</p>
            ) : !namespace.podMetricsAvailable ? (
                <div role="status" className="rr-diag-notice">
                    <HiOutlineInformationCircle size={20} aria-hidden="true" />
                    <div>
                        <p className="rr-diag-notice__title">Per-pod CPU and memory are not available.</p>
                        <p className="rr-diag-muted">
                            They come from metrics-server, which this cluster does not provide or the server may not read.
                            {namespace.podMetricsReason ? ` ${namespace.podMetricsReason}` : ""}
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="rr-diag-grid rr-diag-grid--2">
                        <MetricTile
                            label="Namespace CPU"
                            value={formatCores(namespace.cpuUsedCores)}
                            history={{ values: seriesOf(history, (sample) => sample.kubernetes?.namespace?.cpuUsedCores), format: formatCores }}
                        />
                        <MetricTile
                            label="Namespace memory"
                            value={formatBytes(namespace.memoryUsedBytes)}
                            history={{ values: seriesOf(history, (sample) => sample.kubernetes?.namespace?.memoryUsedBytes), format: formatBytes }}
                        />
                    </div>
                    <h3 className="rr-diag-subtitle">Pods</h3>
                    {pods.length === 0 ? (
                        <p className="rr-diag-muted">No pod figures were reported.</p>
                    ) : (
                        <div className="rr-diag-scroll">
                            <table className="rr-diag-table">
                                <thead>
                                    <tr>
                                        {POD_HEADINGS.map((heading) => (
                                            <th key={heading}>{heading}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pods.map((pod) => (
                                        <tr key={pod.name}>
                                            <td className="rr-diag-mono rr-diag-break">{pod.name}</td>
                                            <td>{pod.component ?? NO_VALUE}</td>
                                            <td className="rr-diag-num">{formatCores(pod.cpuUsedCores)}</td>
                                            <td className="rr-diag-num">{formatBytes(pod.memoryUsedBytes)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
