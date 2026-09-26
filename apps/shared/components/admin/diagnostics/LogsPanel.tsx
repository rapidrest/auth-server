///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useMemo, useState } from "react";
import {
    HiOutlineArrowDownTray,
    HiOutlineArrowPath,
    HiOutlineCheck,
    HiOutlineExclamationTriangle,
    HiOutlinePause,
    HiOutlinePlay,
    HiOutlineSignal,
    HiOutlineSignalSlash,
    HiOutlineStop,
    HiOutlineTrash,
} from "react-icons/hi2";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import Badge, { BadgeTone } from "./Badge.js";
import { SaveFile, timestampedFilename } from "./download.js";
import { formatUptime } from "./format.js";
import type { LogStreamStatus } from "./logClient.js";
import { entriesToLog, entriesToNdjson, entryMatches, LOG_LEVELS, LogEntry, levelVisible } from "./logLines.js";
import { LOG_BUFFER_LIMIT, LOG_CAPTURE_LIMIT } from "./LogStore.js";
import LogViewer, { LOG_VISIBLE_ROWS } from "./LogViewer.js";
import type { LogStream } from "./useLogStream.js";

const STATUS: Record<LogStreamStatus, { label: string; tone: BadgeTone; icon: typeof HiOutlineSignal }> = {
    connecting: { label: "Connecting", tone: "warning", icon: HiOutlineArrowPath },
    live: { label: "Live", tone: "success", icon: HiOutlineSignal },
    reconnecting: { label: "Reconnecting", tone: "warning", icon: HiOutlineArrowPath },
    closed: { label: "Stopped", tone: "neutral", icon: HiOutlineSignalSlash },
    error: { label: "Error", tone: "danger", icon: HiOutlineExclamationTriangle },
};

type Format = "log" | "ndjson";

const MIME_TYPES: Record<Format, string> = { log: "text/plain;charset=utf-8", ndjson: "application/x-ndjson" };

export interface LogsPanelProps {
    stream: LogStream;
    /** Saves a download. */
    saveFile: SaveFile;
}

/**
 * The Logs tab: the server's log stream as it happens, with filters, and captures. A capture records every line from the
 * moment it starts, whatever the filters show, and can be downloaded (as can the display buffer) as a `.log` or `.ndjson` file.
 */
export default function LogsPanel({ stream, saveFile }: LogsPanelProps) {
    const { status, error, running, entries, dropped, capture } = stream;
    const [levels, setLevels] = useState<ReadonlySet<string>>(() => new Set(LOG_LEVELS));
    const [search, setSearch] = useState("");
    const [follow, setFollow] = useState(true);
    const [now, setNow] = useState(() => Date.now());

    // The clock the recording time counts against, ticking only while a capture records.
    const recording = capture?.active === true;
    useEffect(() => {
        if (!recording) {
            return;
        }
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [recording]);

    const needle = search.trim().toLowerCase();
    const matching = useMemo(
        () => entries.filter((entry) => levelVisible(entry, levels) && entryMatches(entry, needle)),
        [entries, levels, needle]
    );
    const filtered = matching.length !== entries.length;
    const badge = STATUS[status];

    function toggleLevel(level: string) {
        const next = new Set(levels);
        if (!next.delete(level)) {
            next.add(level);
        }
        setLevels(next);
    }

    function download(lines: LogEntry[], format: Format) {
        saveFile(
            timestampedFilename("auth-server-logs", format),
            format === "log" ? entriesToLog(lines) : entriesToNdjson(lines),
            MIME_TYPES[format]
        );
    }

    return (
        <div className="rr-diag-stack rr-diag-stack--sm">
            <div className="rr-diag-toolbar">
                <Badge tone={badge.tone} icon={badge.icon}>
                    {badge.label}
                </Badge>
                {running ? (
                    <Button type="button" variant="secondary" onClick={stream.stop}>
                        <HiOutlineStop size={16} aria-hidden="true" />
                        Stop
                    </Button>
                ) : (
                    <Button type="button" onClick={stream.start}>
                        <HiOutlinePlay size={16} aria-hidden="true" />
                        Start
                    </Button>
                )}
                <Button type="button" variant="secondary" aria-pressed={!follow} onClick={() => setFollow(!follow)}>
                    <HiOutlinePause size={16} aria-hidden="true" />
                    {follow ? "Pause scrolling" : "Resume scrolling"}
                </Button>
                <Button type="button" variant="secondary" onClick={stream.clear}>
                    <HiOutlineTrash size={16} aria-hidden="true" />
                    Clear
                </Button>
            </div>

            {error && <Alert>{error}</Alert>}

            <div className="rr-diag-toolbar">
                <div role="group" aria-label="Levels" className="rr-diag-pills">
                    {LOG_LEVELS.map((level) => (
                        <button
                            key={level}
                            type="button"
                            aria-pressed={levels.has(level)}
                            onClick={() => toggleLevel(level)}
                            className="rr-diag-pill"
                        >
                            {levels.has(level) && <HiOutlineCheck size={12} aria-hidden="true" />}
                            {level}
                        </button>
                    ))}
                </div>
                <div className="rr-diag-toolbar__grow">
                    <input
                        type="search"
                        aria-label="Search the log"
                        className="rr-input"
                        placeholder="Search the log"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            <div role="status" className="rr-diag-status">
                {filtered
                    ? `${matching.length} of ${entries.length} buffered lines match.`
                    : `${entries.length} buffered ${entries.length === 1 ? "line" : "lines"}.`}
                {matching.length > LOG_VISIBLE_ROWS && ` Showing the last ${LOG_VISIBLE_ROWS}.`}
                {dropped > 0 && ` ${dropped} older ${dropped === 1 ? "line" : "lines"} dropped (the buffer keeps the last ${LOG_BUFFER_LIMIT}).`}
            </div>

            <LogViewer
                entries={matching}
                follow={follow}
                empty={entries.length === 0 ? "No log lines yet." : "No buffered line matches the filters."}
            />

            <section aria-labelledby="diagnostics-capture-heading" className="rr-diag-section">
                <h2 id="diagnostics-capture-heading" className="rr-diag-section__title rr-diag-section__title--tight">
                    Capture
                </h2>
                <p className="rr-diag-status rr-diag-status--block">
                    A capture records every line received while it runs, whatever the filters show, up to {LOG_CAPTURE_LIMIT.toLocaleString()} lines.
                </p>
                <div className="rr-diag-toolbar">
                    {recording ? (
                        <Button type="button" variant="secondary" onClick={stream.stopCapture}>
                            <HiOutlineStop size={16} aria-hidden="true" />
                            Stop capture
                        </Button>
                    ) : (
                        <Button type="button" onClick={stream.startCapture}>
                            <HiOutlinePlay size={16} aria-hidden="true" />
                            Start capture
                        </Button>
                    )}
                    {capture && (
                        <p role="status" className="rr-diag-capture-status">
                            {recording ? "Recording" : "Capture stopped"}: {capture.count.toLocaleString()} {capture.count === 1 ? "line" : "lines"} in{" "}
                            {formatUptime(((capture.stoppedAt ?? now) - capture.startedAt) / 1000)}
                        </p>
                    )}
                </div>
                {capture && capture.missed > 0 && (
                    <p className="rr-diag-capture-status">
                        The capture is full: {capture.missed.toLocaleString()} later {capture.missed === 1 ? "line was" : "lines were"} not recorded.
                    </p>
                )}
                <div className="rr-diag-toolbar rr-diag-toolbar--spaced">
                    <span className="rr-diag-subtitle rr-diag-subtitle--inline">Download</span>
                    {(["log", "ndjson"] as const).map((format) => (
                        <Button
                            key={`buffer-${format}`}
                            type="button"
                            variant="secondary"
                            disabled={entries.length === 0}
                            onClick={() => download(entries, format)}
                        >
                            <HiOutlineArrowDownTray size={16} aria-hidden="true" />
                            {`Buffer (.${format})`}
                        </Button>
                    ))}
                    {capture &&
                        (["log", "ndjson"] as const).map((format) => (
                            <Button
                                key={`capture-${format}`}
                                type="button"
                                variant="secondary"
                                disabled={capture.count === 0}
                                onClick={() => download(stream.captureEntries(), format)}
                            >
                                <HiOutlineArrowDownTray size={16} aria-hidden="true" />
                                {`Capture (.${format})`}
                            </Button>
                        ))}
                </div>
                <p className="rr-diag-status rr-diag-status--block">The buffer download holds every buffered line, not only the ones the filters show.</p>
            </section>
        </div>
    );
}
