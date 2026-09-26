///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { getVersions, VersionsResponse } from "../../../lib/diagnosticsApi.js";
import Alert from "../../feedback/Alert.js";

const KIND_LABELS: Record<string, string> = {
    server: "This server",
    mongodb: "MongoDB",
    postgresql: "PostgreSQL",
    redis: "Redis",
};

/**
 * What's deployed: this server's Node.js and package versions, the version each datastore reports over its
 * connection, the image of every container in the Kubernetes namespace (including the datastores' own pods), and
 * every installed package.
 */
export default function VersionsCard() {
    const [versions, setVersions] = useState<VersionsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [packageFilter, setPackageFilter] = useState("");

    useEffect(() => {
        getVersions()
            .then(setVersions)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load version information."));
    }, []);

    if (error) {
        return <Alert>{error}</Alert>;
    }
    if (!versions) {
        return <p className="rr-hint">Loading&hellip;</p>;
    }

    const { server, datastores, pods } = versions;
    const filter = packageFilter.trim().toLowerCase();
    const packages = filter ? server.packages.filter((p) => p.name.toLowerCase().includes(filter)) : server.packages;

    return (
        <>
            <div className="rr-section-title">Server</div>
            <dl className="rr-diag-facts">
                <dt>Deployed package</dt>
                <dd>
                    {server.name} {server.version}
                </dd>
                <dt>Node.js</dt>
                <dd>
                    {server.node.version} <span className="rr-hint">(V8 {server.node.v8})</span>
                </dd>
                <dt>Platform</dt>
                <dd>
                    {server.node.platform} {server.node.arch}
                </dd>
            </dl>

            <div className="rr-section-title">Datastores</div>
            <p className="rr-hint">As reported by the server over its own connections.</p>
            <div style={{ overflowX: "auto" }}>
                <table className="rr-table">
                    <thead>
                        <tr>
                            <th>Datastore</th>
                            <th>Used for</th>
                            <th>Version</th>
                        </tr>
                    </thead>
                    <tbody>
                        {datastores.map((datastore) => (
                            <tr key={datastore.role}>
                                <td>{KIND_LABELS[datastore.kind] ?? datastore.kind}</td>
                                <td>{datastore.role}</td>
                                <td>
                                    {datastore.error ? (
                                        <span className="rr-diag-error">{datastore.error}</span>
                                    ) : (
                                        (datastore.version ?? <span className="rr-hint">&mdash;</span>)
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rr-section-title">Containers</div>
            {versions.podsError ? (
                <Alert>Could not read the namespace&apos;s pods: {versions.podsError}</Alert>
            ) : pods === null ? (
                <p className="rr-hint">Not running in Kubernetes.</p>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>Pod</th>
                                <th>Container</th>
                                <th>Component</th>
                                <th>Image</th>
                                <th>Ready</th>
                                <th>Restarts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pods.flatMap((pod) =>
                                pod.containers.map((container) => (
                                    <tr key={`${pod.name}/${container.name}`}>
                                        <td>
                                            {pod.name}
                                            {pod.self && (
                                                <>
                                                    {" "}
                                                    <span className="rr-badge">this pod</span>
                                                </>
                                            )}
                                        </td>
                                        <td>{container.name}</td>
                                        <td>{KIND_LABELS[container.kind] ?? "—"}</td>
                                        <td className="rr-diag-mono">{container.image}</td>
                                        <td>{container.ready ? "Yes" : "No"}</td>
                                        <td>{container.restarts}</td>
                                    </tr>
                                )),
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="rr-section-title">Installed packages ({server.packages.length})</div>
            <div className="rr-field" style={{ maxWidth: "20rem" }}>
                <label htmlFor="diagPackageFilter">Filter</label>
                <input
                    id="diagPackageFilter"
                    className="rr-input"
                    type="search"
                    placeholder="package name"
                    value={packageFilter}
                    onChange={(e) => setPackageFilter(e.target.value)}
                />
            </div>
            {packages.length === 0 ? (
                <p className="rr-hint">No matching packages.</p>
            ) : (
                <div className="rr-diag-scroll">
                    <table className="rr-table">
                        <thead>
                            <tr>
                                <th>Package</th>
                                <th>Version</th>
                            </tr>
                        </thead>
                        <tbody>
                            {packages.map((p) => (
                                <tr key={`${p.name}@${p.version}`}>
                                    <td>{p.name}</td>
                                    <td>{p.version}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
