///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode, useEffect, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { getSystem, SystemResponse } from "../../../lib/diagnosticsApi.js";
import { formatBytes, formatCores, formatDuration, formatPercent, fraction } from "../../../lib/diagnostics.js";
import Button from "../../buttons/Button.js";
import Alert from "../../feedback/Alert.js";
import Meter from "./Meter.js";
import Sparkline from "./Sparkline.js";

/** How many samples of history the sparklines keep. */
const HISTORY_LENGTH = 60;
const INTERVALS = [
    { label: "2 seconds", ms: 2000 },
    { label: "5 seconds", ms: 5000 },
    { label: "10 seconds", ms: 10000 },
    { label: "30 seconds", ms: 30000 },
];

interface History {
    serverCpu: number[];
    serverMemory: number[];
    namespaceCpu: number[];
    namespaceMemory: number[];
}

const EMPTY_HISTORY: History = { serverCpu: [], serverMemory: [], namespaceCpu: [], namespaceMemory: [] };

/** Sums the figures of `values` that were reported at all; `undefined` when none were. */
function total(values: (number | undefined)[]): number | undefined {
    const present = values.filter((value): value is number => value !== undefined);
    return present.length === 0 ? undefined : present.reduce((a, b) => a + b, 0);
}

/** This server's memory measured against the container's limit when it has one, else the host's memory. */
function serverMemoryCapacity(memory: SystemResponse["server"]["memory"]): number {
    return memory.containerLimitBytes ?? memory.systemTotalBytes;
}

/** The snapshot's figures that get a sparkline. */
function sampleOf(snapshot: SystemResponse): Record<keyof History, number | undefined> {
    const pods = snapshot.kubernetes?.pods ?? [];
    return {
        serverCpu: snapshot.server.cpu.processPercent,
        serverMemory: snapshot.server.memory.rssBytes,
        namespaceCpu: total(pods.map((pod) => pod.cpuCores)),
        namespaceMemory: total(pods.map((pod) => pod.memoryBytes)),
    };
}

function appendSample(history: History, snapshot: SystemResponse): History {
    const sample = sampleOf(snapshot);
    const next = { ...history };
    for (const key of Object.keys(sample) as (keyof History)[]) {
        const value = sample[key];
        if (value !== undefined) {
            next[key] = [...history[key], value].slice(-HISTORY_LENGTH);
        }
    }
    return next;
}

function Stat({ label, value, detail, children }: { label: string; value: string; detail?: string; children?: ReactNode }) {
    return (
        <div className="rr-diag-stat">
            <div className="rr-diag-stat__label">{label}</div>
            <div className="rr-diag-stat__value">{value}</div>
            {detail && <div className="rr-hint">{detail}</div>}
            {children}
        </div>
    );
}

/**
 * Live monitoring: polls the server for a snapshot of its own CPU/memory/disk use, the namespace's pods and volume
 * claims (with live use when the cluster has metrics-server) and each datastore's own storage figures, keeping the
 * last minute or so of history for the sparklines.
 */
export default function SystemCard() {
    const [snapshot, setSnapshot] = useState<SystemResponse | null>(null);
    const [history, setHistory] = useState<History>(EMPTY_HISTORY);
    const [error, setError] = useState<string | null>(null);
    const [live, setLive] = useState(true);
    const [intervalMs, setIntervalMs] = useState(5000);

    useEffect(() => {
        if (!live) {
            return;
        }
        let cancelled = false;
        function poll() {
            getSystem()
                .then((next) => {
                    if (!cancelled) {
                        setSnapshot(next);
                        setHistory((h) => appendSample(h, next));
                        setError(null);
                    }
                })
                .catch((err) => {
                    if (!cancelled) {
                        setError(err instanceof ApiRequestError ? err.message : "Could not load system information.");
                    }
                });
        }
        poll();
        const timer = setInterval(poll, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [live, intervalMs]);

    const controls = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}>
            <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={() => setLive((l) => !l)}>
                {live ? "Pause" : "Resume"}
            </Button>
            <div className="rr-field" style={{ marginBottom: 0 }}>
                <label htmlFor="diagInterval">Refresh every</label>
                <select
                    id="diagInterval"
                    className="rr-input"
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(Number(e.target.value))}
                >
                    {INTERVALS.map(({ label, ms }) => (
                        <option key={ms} value={ms}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
            {snapshot && (
                <span className="rr-hint">
                    {live ? "Live" : "Paused"} &middot; updated {new Date(snapshot.timestamp).toLocaleTimeString()}
                </span>
            )}
        </div>
    );

    if (!snapshot) {
        return (
            <>
                {controls}
                {error ? <Alert>{error}</Alert> : <p className="rr-hint">Loading&hellip;</p>}
            </>
        );
    }

    const { server, datastores, kubernetes } = snapshot;
    const capacity = serverMemoryCapacity(server.memory);
    const cpuFraction = server.cpu.processPercent / 100 / server.cpu.cores;
    const namespaceCpu = total((kubernetes?.pods ?? []).map((pod) => pod.cpuCores));
    const namespaceMemory = total((kubernetes?.pods ?? []).map((pod) => pod.memoryBytes));
    const namespaceCpuRequest = total((kubernetes?.pods ?? []).map((pod) => pod.cpuRequestCores));
    const namespaceMemoryRequest = total((kubernetes?.pods ?? []).map((pod) => pod.memoryRequestBytes));

    return (
        <>
            {controls}
            {error && <Alert>{error}</Alert>}

            <div className="rr-section-title">This server</div>
            <div className="rr-diag-stats">
                <Stat
                    label="CPU"
                    value={formatPercent(server.cpu.processPercent)}
                    detail={`of one core · ${server.cpu.cores} available · load ${server.cpu.loadAverage.map((l) => l.toFixed(2)).join(" ")}`}
                >
                    <Meter label="CPU" value={Math.min(1, cpuFraction)} />
                    <Sparkline label="CPU history" values={history.serverCpu} />
                </Stat>
                <Stat
                    label="Memory"
                    value={formatBytes(server.memory.rssBytes)}
                    detail={`of ${formatBytes(capacity)} ${server.memory.containerLimitBytes === undefined ? "on the host" : "container limit"} · heap ${formatBytes(server.memory.heapUsedBytes)} of ${formatBytes(server.memory.heapTotalBytes)}`}
                >
                    <Meter label="Memory" value={fraction(server.memory.rssBytes, capacity) ?? 0} />
                    <Sparkline label="Memory history" values={history.serverMemory} />
                </Stat>
                <Stat label="Uptime" value={formatDuration(server.uptimeSeconds)} />
            </div>

            <div className="rr-section-title">Disk (this pod)</div>
            <div style={{ overflowX: "auto" }}>
                <table className="rr-table">
                    <thead>
                        <tr>
                            <th>Path</th>
                            <th>Used</th>
                            <th>Free</th>
                            <th>Total</th>
                            <th style={{ width: "30%" }} />
                        </tr>
                    </thead>
                    <tbody>
                        {server.disks.map((disk) => (
                            <tr key={disk.path}>
                                <td className="rr-diag-mono">{disk.path}</td>
                                <td>{formatBytes(disk.usedBytes)}</td>
                                <td>{formatBytes(disk.availableBytes)}</td>
                                <td>{formatBytes(disk.totalBytes)}</td>
                                <td>
                                    <Meter label={`${disk.path} usage`} value={fraction(disk.usedBytes, disk.totalBytes) ?? 0} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="rr-section-title">Datastores</div>
            <p className="rr-hint">
                Storage as each datastore reports it: the volume for MongoDB, the database&apos;s size for PostgreSQL,
                memory for Redis.
            </p>
            <div style={{ overflowX: "auto" }}>
                <table className="rr-table">
                    <thead>
                        <tr>
                            <th>Datastore</th>
                            <th>Used</th>
                            <th>Capacity</th>
                            <th style={{ width: "30%" }} />
                        </tr>
                    </thead>
                    <tbody>
                        {datastores.map((datastore) => {
                            const used = fraction(datastore.usedBytes, datastore.totalBytes);
                            return (
                                <tr key={datastore.role}>
                                    <td>
                                        {datastore.kind} <span className="rr-hint">({datastore.role})</span>
                                    </td>
                                    <td>
                                        {datastore.error ? (
                                            <span className="rr-diag-error">{datastore.error}</span>
                                        ) : (
                                            formatBytes(datastore.usedBytes)
                                        )}
                                    </td>
                                    <td>{formatBytes(datastore.totalBytes)}</td>
                                    <td>{used !== undefined && <Meter label={`${datastore.kind} usage`} value={used} />}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="rr-section-title">Namespace{kubernetes ? ` ${kubernetes.namespace}` : ""}</div>
            {kubernetes === null ? (
                <p className="rr-hint">Not running in Kubernetes.</p>
            ) : (
                <>
                    {kubernetes.error && <Alert>Could not read the namespace: {kubernetes.error}</Alert>}
                    {!kubernetes.metricsAvailable && !kubernetes.error && (
                        <p className="rr-hint">
                            Live pod usage isn&apos;t available: the cluster has no metrics-server, or the server
                            isn&apos;t permitted to read it. Requests and limits are still shown.
                        </p>
                    )}
                    <div className="rr-diag-stats">
                        <Stat
                            label="CPU"
                            value={namespaceCpu === undefined ? "—" : formatCores(namespaceCpu)}
                            detail={`${formatCores(namespaceCpuRequest)} requested`}
                        >
                            <Sparkline label="Namespace CPU history" values={history.namespaceCpu} />
                        </Stat>
                        <Stat
                            label="Memory"
                            value={formatBytes(namespaceMemory)}
                            detail={`${formatBytes(namespaceMemoryRequest)} requested`}
                        >
                            <Sparkline label="Namespace memory history" values={history.namespaceMemory} />
                        </Stat>
                    </div>
                    <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                        <table className="rr-table">
                            <thead>
                                <tr>
                                    <th>Pod</th>
                                    <th>Phase</th>
                                    <th>CPU (request / limit)</th>
                                    <th>Memory (request / limit)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {kubernetes.pods.map((pod) => (
                                    <tr key={pod.name}>
                                        <td>
                                            {pod.name}
                                            {pod.self && (
                                                <>
                                                    {" "}
                                                    <span className="rr-badge">this pod</span>
                                                </>
                                            )}
                                        </td>
                                        <td>{pod.phase}</td>
                                        <td>
                                            {formatCores(pod.cpuCores)}{" "}
                                            <span className="rr-hint">
                                                ({formatCores(pod.cpuRequestCores)} / {formatCores(pod.cpuLimitCores)})
                                            </span>
                                        </td>
                                        <td>
                                            {formatBytes(pod.memoryBytes)}{" "}
                                            <span className="rr-hint">
                                                ({formatBytes(pod.memoryRequestBytes)} / {formatBytes(pod.memoryLimitBytes)})
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="rr-section-title">Persistent volume claims</div>
                    <p className="rr-hint">
                        Kubernetes reports only the size each claim was provisioned at, not how much of it is used.
                    </p>
                    {kubernetes.pvcs.length === 0 ? (
                        <p className="rr-hint">No persistent volume claims.</p>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table className="rr-table">
                                <thead>
                                    <tr>
                                        <th>Claim</th>
                                        <th>Status</th>
                                        <th>Capacity</th>
                                        <th>Storage class</th>
                                        <th>Mounted by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {kubernetes.pvcs.map((pvc) => (
                                        <tr key={pvc.name}>
                                            <td>{pvc.name}</td>
                                            <td>{pvc.phase}</td>
                                            <td>{formatBytes(pvc.capacityBytes)}</td>
                                            <td>{pvc.storageClass ?? "—"}</td>
                                            <td>{pvc.mountedBy.length === 0 ? "—" : pvc.mountedBy.join(", ")}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
