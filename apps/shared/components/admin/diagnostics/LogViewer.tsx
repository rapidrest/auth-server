///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useRef } from "react";
import { entryTime, LOG_LEVELS, LogEntry } from "./logLines.js";

/** The most rows the viewer puts in the page: the last this many lines that match. (The buffer behind it is bigger.) */
export const LOG_VISIBLE_ROWS = 500;

/** What is written in a line's level column: the level, or a marker for a line without one. */
export function levelLabel(entry: LogEntry): string {
    if (entry.level) {
        return entry.level.toUpperCase();
    }
    return entry.structured ? "—" : "RAW";
}

/** A line's `stack` (which is shown as lines of its own), and its other extra fields. */
export function splitExtra(extra: Record<string, unknown>): { stack: string | undefined; rest: Record<string, unknown> } {
    const { stack, ...rest } = extra;
    return typeof stack === "string" ? { stack, rest } : { stack: undefined, rest: extra };
}

/** The level's name in a tinted box. The name is always written, so the tint only helps the eye find it. */
export function LevelBadge({ entry }: { entry: LogEntry }) {
    const known = (LOG_LEVELS as readonly string[]).includes(entry.level) ? ` rr-diag-log__level--${entry.level}` : "";
    return <span className={`rr-diag-log__level${known}`}>{levelLabel(entry)}</span>;
}

function logRow(entry: LogEntry) {
    const { stack, rest } = splitExtra(entry.extra);
    return (
        <div key={entry.id} className="rr-diag-log__row">
            <span className="rr-diag-muted">{entryTime(entry)}</span> <LevelBadge entry={entry} /> <span className="rr-diag-log__message">{entry.message}</span>
            {Object.keys(rest).length > 0 && <span className="rr-diag-muted"> {JSON.stringify(rest)}</span>}
            {stack !== undefined && <div className="rr-diag-log__stack">{stack}</div>}
        </div>
    );
}

export interface LogViewerProps {
    /** The lines to show, oldest first; only the last `LOG_VISIBLE_ROWS` are put in the page. */
    entries: LogEntry[];
    /** Whether the view stays scrolled to the newest line. */
    follow: boolean;
    /** Said when there is nothing to show. */
    empty: string;
}

/** The lines, as monospace text in a scrolling box. The box is a live log region, but not announced line by line. */
export default function LogViewer({ entries, follow, empty }: LogViewerProps) {
    const box = useRef<HTMLDivElement>(null);
    const shown = entries.slice(-LOG_VISIBLE_ROWS);

    useEffect(() => {
        if (follow) {
            // Mounted by the time an effect runs.
            box.current!.scrollTop = box.current!.scrollHeight;
        }
    }, [shown.length, entries[entries.length - 1]?.id, follow]);

    return (
        <div ref={box} role="log" aria-label="Server log" aria-live="off" tabIndex={0} className="rr-diag-log">
            {shown.length === 0 ? <p className="rr-diag-muted">{empty}</p> : shown.map(logRow)}
        </div>
    );
}
