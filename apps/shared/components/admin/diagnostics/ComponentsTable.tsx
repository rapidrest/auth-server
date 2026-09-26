///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineMinusCircle, HiOutlineQuestionMarkCircle } from "react-icons/hi2";
import type { DiagnosticsComponent, DiagnosticsContainer, DiagnosticsPod } from "./diagnosticsApi.js";
import Badge from "./Badge.js";
import KubernetesNotice from "./KubernetesNotice.js";
import { formatDateTime, NO_VALUE, shortDigest } from "./format.js";

const STATUS: Record<DiagnosticsComponent["status"], { label: string; tone: "success" | "warning" | "neutral"; icon: typeof HiOutlineCheckCircle }> = {
    running: { label: "Running", tone: "success", icon: HiOutlineCheckCircle },
    "not-ready": { label: "Not ready", tone: "warning", icon: HiOutlineExclamationTriangle },
    missing: { label: "Not found", tone: "neutral", icon: HiOutlineMinusCircle },
    unknown: { label: "Unknown", tone: "neutral", icon: HiOutlineQuestionMarkCircle },
};

/** The container to describe a component by: the one running the image tag the server calls its version, else the first. */
export function mainContainer(component: DiagnosticsComponent): DiagnosticsContainer | undefined {
    const containers = component.pods.flatMap((pod) => pod.containers);
    return containers.find((container) => container.tag !== undefined && container.tag === component.version) ?? containers[0];
}

/** `image` with its tag, unless the server already wrote the tag into the image. */
export function imageReference(container: DiagnosticsContainer): string {
    return container.tag && !container.image.endsWith(`:${container.tag}`) ? `${container.image}:${container.tag}` : container.image;
}

const HEADINGS = ["Component", "Status", "Version", "Image", "Digest", "Restarts", "Node"];

export interface ComponentsTableProps {
    components: DiagnosticsComponent[];
    kubernetes: { available: boolean; reason?: string };
}

/** The other containers of the deployment (its databases and cache) and how they are doing. */
export default function ComponentsTable({ components, kubernetes }: ComponentsTableProps) {
    return (
        <section aria-labelledby="diagnostics-components-heading" className="rr-diag-section">
            <h2 id="diagnostics-components-heading" className="rr-diag-section__title">
                Other containers
            </h2>
            {!kubernetes.available ? (
                <KubernetesNotice reason={kubernetes.reason} />
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
                            {components.map(componentRow)}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function componentRow(component: DiagnosticsComponent) {
    const status = STATUS[component.status] ?? STATUS.unknown;
    const main = mainContainer(component);
    const restarts = component.pods.reduce((total, pod) => total + pod.restarts, 0);
    const nodes = [...new Set(component.pods.map((pod) => pod.node).filter(Boolean))];
    return (
        <tr key={component.component}>
            <td>
                <div className="rr-diag-strong">{component.component}</div>
                {component.pods.length > 0 && (
                    <details className="rr-diag-details">
                        <summary>
                            {component.pods.length} {component.pods.length === 1 ? "pod" : "pods"}
                        </summary>
                        <ul className="rr-diag-pods">
                            {component.pods.map(podDetail)}
                        </ul>
                    </details>
                )}
            </td>
            <td>
                <Badge tone={status.tone} icon={status.icon}>
                    {status.label}
                </Badge>
            </td>
            <td className="rr-diag-mono">{component.version ?? NO_VALUE}</td>
            <td className="rr-diag-mono rr-diag-break">{main?.image ?? NO_VALUE}</td>
            <td className="rr-diag-mono" title={main?.digest}>
                {shortDigest(main?.digest)}
            </td>
            <td className="rr-diag-num">{component.pods.length > 0 ? restarts : NO_VALUE}</td>
            <td>{nodes.length > 0 ? nodes.join(", ") : NO_VALUE}</td>
        </tr>
    );
}

function podDetail(pod: DiagnosticsPod) {
    return (
        <li key={pod.name} className="rr-diag-pod">
            <div className="rr-diag-mono rr-diag-break rr-diag-pod__name">{pod.name}</div>
            <div>
                {pod.phase} &middot; {pod.ready ? "ready" : "not ready"} &middot; {pod.restarts} {pod.restarts === 1 ? "restart" : "restarts"}
                {pod.node ? ` · on ${pod.node}` : ""}
                {pod.startedAt ? ` · started ${formatDateTime(pod.startedAt)}` : ""}
            </div>
            <ul className="rr-diag-pod__containers">
                {pod.containers.map((container) => (
                    <li key={container.name} className="rr-diag-mono rr-diag-break">
                        {container.name}: {imageReference(container)}
                        {container.digest ? ` @${shortDigest(container.digest)}` : ""} &middot; {container.ready ? "ready" : "not ready"} &middot;{" "}
                        {container.restartCount} {container.restartCount === 1 ? "restart" : "restarts"}
                    </li>
                ))}
            </ul>
        </li>
    );
}
