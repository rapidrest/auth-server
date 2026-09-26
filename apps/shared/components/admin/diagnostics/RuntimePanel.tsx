///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import Alert from "../../feedback/Alert.js";
import type { DiagnosticsRuntime } from "./diagnosticsApi.js";
import type { DiagnosticsResource } from "./useDiagnosticsResource.js";
import Badge from "./Badge.js";
import KubernetesNotice from "./KubernetesNotice.js";
import { formatDateTime, NO_VALUE } from "./format.js";

/** What a distribution's id is called on screen. */
const DISTRIBUTIONS: Record<string, string> = {
    k3s: "k3s",
    rke2: "RKE2",
    eks: "Amazon EKS",
    gke: "Google GKE",
    aks: "Azure AKS",
    kubernetes: "Kubernetes",
};

const NODE_HEADINGS = ["Node", "Internal IP", "Pods of this deployment"];

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
    return (
        <div>
            <dt>{term}</dt>
            <dd>{children}</dd>
        </div>
    );
}

function RuntimeDetails({ runtime }: { runtime: DiagnosticsRuntime }) {
    const version = runtime.version;
    const nodes = runtime.nodes ?? [];
    return (
        <>
            <section aria-labelledby="diagnostics-kubernetes-heading" className="rr-diag-section">
                <h2 id="diagnostics-kubernetes-heading" className="rr-diag-section__title">
                    Kubernetes
                </h2>
                <dl className="rr-diag-facts">
                    <Fact term="Version">
                        <span className="rr-diag-mono">{version?.gitVersion ?? NO_VALUE}</span>
                    </Fact>
                    <Fact term="Distribution">
                        {version ? <Badge tone="info">{DISTRIBUTIONS[version.distribution] ?? version.distribution}</Badge> : NO_VALUE}
                    </Fact>
                    <Fact term="Platform">{version?.platform ?? NO_VALUE}</Fact>
                    <Fact term="Namespace">
                        <span className="rr-diag-mono">{runtime.namespace ?? NO_VALUE}</span>
                    </Fact>
                    <Fact term="Go version">{version?.goVersion ?? NO_VALUE}</Fact>
                    <Fact term="Built">{formatDateTime(version?.buildDate)}</Fact>
                </dl>
            </section>
            <section aria-labelledby="diagnostics-nodes-heading" className="rr-diag-section">
                <h2 id="diagnostics-nodes-heading" className="rr-diag-section__title rr-diag-section__title--tight">
                    Nodes
                </h2>
                <p className="rr-diag-status rr-diag-status--block">
                    The nodes that run this deployment&rsquo;s pods. The server can only see its own namespace, so nothing about the nodes
                    themselves is listed here.
                </p>
                {nodes.length === 0 ? (
                    <p className="rr-diag-muted">No node is running any of this deployment&rsquo;s pods.</p>
                ) : (
                    <div className="rr-diag-scroll">
                        <table className="rr-diag-table">
                            <thead>
                                <tr>
                                    {NODE_HEADINGS.map((heading) => (
                                        <th key={heading}>{heading}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {nodes.map((node) => (
                                    <tr key={node.name}>
                                        <td className="rr-diag-mono rr-diag-break">{node.name}</td>
                                        <td className="rr-diag-mono">{node.internalIP ?? NO_VALUE}</td>
                                        <td className="rr-diag-num">{node.podCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}

/** The Runtime tab: the Kubernetes version and the nodes the deployment's pods run on. */
export default function RuntimePanel({ runtime }: { runtime: DiagnosticsResource<DiagnosticsRuntime> }) {
    const { data, error, loading } = runtime;
    return (
        <div className="rr-diag-stack">
            {error && <Alert>{error}</Alert>}
            {!data && loading && <p className="rr-diag-muted">Loading&hellip;</p>}
            {data && (data.available ? <RuntimeDetails runtime={data} /> : <KubernetesNotice reason={data.reason} />)}
        </div>
    );
}
