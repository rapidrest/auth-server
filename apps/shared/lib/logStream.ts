///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * A client for the server's live log socket, `/api/admin/logs` (`BaseAdminRoute.logs()`). The socket authenticates
 * with the `jwt` cookie the browser sends on the upgrade request, and needs the same fresh elevation as every other
 * admin call — the Diagnostics page is only reachable once that's been established.
 *
 * Every frame is one JSON string. The first is `{"type":"SUBSCRIBED", ...}`, confirming the subscription; every
 * later one is a Winston log entry (`level`, `message`, …) published by any of the deployment's replicas. There is
 * no history: the stream starts at the moment of subscribing.
 */

export interface LogEntry {
    /** When the browser received the entry — used when the entry carries no timestamp of its own. */
    receivedAt: string;
    level: string;
    message: string;
    /** The entry's own timestamp, when the logger adds one. */
    timestamp?: string;
    /** The entry exactly as the server sent it. */
    raw: string;
}

export interface LogStreamHandlers {
    /** The server confirmed the subscription; entries follow. */
    onSubscribed(): void;
    onEntry(entry: LogEntry): void;
    /** The socket closed, or couldn't open. `reason` is the server's, if it gave one. */
    onClose(reason: string): void;
}

export interface LogStream {
    close(): void;
}

/** The socket URL for the page's own origin, over `wss:` when the page is served over `https:`. */
export function logStreamUrl(location: Pick<Location, "protocol" | "host"> = window.location): string {
    return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/admin/logs`;
}

/**
 * Turns one frame into a log entry, or `undefined` for the subscription confirmation. A frame that isn't JSON (or
 * isn't a log entry) is kept as an `info` line rather than lost.
 */
export function parseLogFrame(frame: string, now: Date = new Date()): LogEntry | undefined {
    const receivedAt = now.toISOString();
    let parsed: any;
    try {
        parsed = JSON.parse(frame);
    } catch {
        return { receivedAt, level: "info", message: frame, raw: frame };
    }
    if (parsed?.type === "SUBSCRIBED") {
        return undefined;
    }
    return {
        receivedAt,
        level: typeof parsed?.level === "string" ? parsed.level : "info",
        message: typeof parsed?.message === "string" ? parsed.message : frame,
        timestamp: typeof parsed?.timestamp === "string" ? parsed.timestamp : undefined,
        raw: frame,
    };
}

/** Opens the log socket. `createSocket` is only for tests. */
export function openLogStream(
    handlers: LogStreamHandlers,
    createSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
): LogStream {
    const socket = createSocket(logStreamUrl());
    let closed = false;
    socket.onmessage = (event) => {
        const entry = parseLogFrame(String(event.data));
        if (entry) {
            handlers.onEntry(entry);
        } else {
            handlers.onSubscribed();
        }
    };
    socket.onclose = (event) => {
        // A close the caller asked for isn't news to it.
        if (!closed) {
            handlers.onClose(event.reason || `closed (code ${event.code})`);
        }
    };
    return {
        close() {
            closed = true;
            socket.close();
        },
    };
}

/** One line of text for an entry: `<timestamp> <LEVEL> <message>`. */
export function formatLogLine(entry: LogEntry): string {
    return `${entry.timestamp ?? entry.receivedAt} ${entry.level.toUpperCase().padEnd(5)} ${entry.message}`;
}
