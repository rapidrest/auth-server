///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useCallback, useEffect, useRef, useState } from "react";
import { downloadText } from "../../../lib/diagnostics.js";
import { formatLogLine, LogEntry, LogStream, openLogStream } from "../../../lib/logStream.js";
import Button from "../../buttons/Button.js";
import Alert from "../../feedback/Alert.js";

/** The most entries kept in the browser: older ones are dropped as new ones arrive. */
export const MAX_LOG_ENTRIES = 5000;

const LEVELS = ["error", "warn", "info", "http", "verbose", "debug", "silly"];

type Status = "connecting" | "live" | "disconnected";
type DownloadFormat = "text" | "json";

/** The stamp used in a downloaded capture's file name: `20260926-103000`. */
function fileStamp(date: Date): string {
    return date.toISOString().replace(/\.\d+Z$/, "").replace(/[-:]/g, "").replace("T", "-");
}

/**
 * Live monitoring of the service log: tails `/api/admin/logs` (every replica's log, as it happens), holds the most
 * recent entries in the browser, and downloads what it has captured as a text or JSON Lines file. The stream has no
 * history, so a capture starts when the page connects (or when Clear is pressed).
 */
export default function LogsCard() {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<Status>("connecting");
    const [closeReason, setCloseReason] = useState<string | null>(null);
    // A paused view shows the entries as they were when it was paused; capturing carries on underneath.
    const [frozen, setFrozen] = useState<LogEntry[] | null>(null);
    const [follow, setFollow] = useState(true);
    const [level, setLevel] = useState("");
    const [search, setSearch] = useState("");
    const [format, setFormat] = useState<DownloadFormat>("text");
    const [capturedSince, setCapturedSince] = useState(() => new Date());
    const streamRef = useRef<LogStream | null>(null);
    const viewRef = useRef<HTMLDivElement>(null);

    const connect = useCallback(() => {
        streamRef.current?.close();
        setStatus("connecting");
        setCloseReason(null);
        streamRef.current = openLogStream({
            onSubscribed: () => setStatus("live"),
            onEntry: (entry) => setEntries((previous) => [...previous, entry].slice(-MAX_LOG_ENTRIES)),
            onClose: (reason) => {
                setStatus("disconnected");
                setCloseReason(reason);
            },
        });
    }, []);

    useEffect(() => {
        connect();
        return () => streamRef.current?.close();
    }, [connect]);

    const shown = (frozen ?? entries).filter(
        (entry) =>
            (!level || entry.level === level) &&
            (!search || entry.message.toLowerCase().includes(search.toLowerCase())),
    );

    useEffect(() => {
        const view = viewRef.current;
        if (follow && view) {
            view.scrollTop = view.scrollHeight;
        }
    }, [shown.length, follow]);

    function handleClear() {
        setEntries([]);
        setFrozen((current) => (current === null ? null : []));
        setCapturedSince(new Date());
    }

    function handleDownload() {
        const now = new Date();
        const stamp = fileStamp(now);
        if (format === "json") {
            downloadText(`service-log-${stamp}.jsonl`, entries.map((entry) => entry.raw).join("\n") + "\n", "application/x-ndjson");
        } else {
            downloadText(`service-log-${stamp}.log`, entries.map(formatLogLine).join("\n") + "\n");
        }
    }

    const statusLabel = { connecting: "Connecting…", live: "Live", disconnected: "Disconnected" }[status];

    return (
        <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                <div className="rr-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="diagLogLevel">Level</label>
                    <select id="diagLogLevel" className="rr-input" value={level} onChange={(e) => setLevel(e.target.value)}>
                        <option value="">Any</option>
                        {LEVELS.map((l) => (
                            <option key={l} value={l}>
                                {l}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="rr-field" style={{ flex: "1 1 200px", marginBottom: 0 }}>
                    <label htmlFor="diagLogSearch">Search</label>
                    <input
                        id="diagLogSearch"
                        className="rr-input"
                        type="search"
                        placeholder="text in the message"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setFrozen((current) => (current === null ? entries : null))}
                >
                    {frozen === null ? "Pause" : "Resume"}
                </Button>
                <label className="rr-diag-check">
                    <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
                </label>
                <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={handleClear}>
                    Clear
                </Button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                <div className="rr-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="diagLogFormat">Download as</label>
                    <select
                        id="diagLogFormat"
                        className="rr-input"
                        value={format}
                        onChange={(e) => setFormat(e.target.value as DownloadFormat)}
                    >
                        <option value="text">Text (.log)</option>
                        <option value="json">JSON Lines (.jsonl)</option>
                    </select>
                </div>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto" }}
                    disabled={entries.length === 0}
                    onClick={handleDownload}
                >
                    Download capture
                </Button>
                <span className="rr-hint">
                    <span className={`rr-badge${status === "live" ? " rr-badge--success" : ""}`}>{statusLabel}</span>{" "}
                    {entries.length} {entries.length === 1 ? "entry" : "entries"} captured since{" "}
                    {capturedSince.toLocaleTimeString()}
                    {entries.length === MAX_LOG_ENTRIES && ` (the latest ${MAX_LOG_ENTRIES} are kept)`}
                </span>
                {status === "disconnected" && (
                    <Button variant="secondary" type="button" style={{ width: "auto" }} onClick={connect}>
                        Reconnect
                    </Button>
                )}
            </div>

            {status === "disconnected" && <Alert>The log stream closed: {closeReason}</Alert>}

            <div className="rr-diag-log" ref={viewRef} role="log" aria-label="Service log">
                {shown.length === 0 ? (
                    <span className="rr-hint">{entries.length === 0 ? "Waiting for log entries…" : "No entries match the filter."}</span>
                ) : (
                    shown.map((entry, i) => (
                        <div key={i} className={`rr-diag-log__line rr-diag-log__line--${entry.level}`}>
                            {formatLogLine(entry)}
                        </div>
                    ))
                )}
            </div>
        </>
    );
}
