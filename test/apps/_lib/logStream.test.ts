// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLogLine, logStreamUrl, openLogStream, parseLogFrame } from "../../../apps/shared/lib/logStream.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

const NOW = new Date("2026-09-26T10:30:00.000Z");

describe("logStreamUrl", () => {
    it("uses ws: for an http page and wss: for an https one", () => {
        expect(logStreamUrl({ protocol: "http:", host: "localhost:3000" })).toBe("ws://localhost:3000/api/admin/logs");
        expect(logStreamUrl({ protocol: "https:", host: "auth.example.com" })).toBe("wss://auth.example.com/api/admin/logs");
    });

    it("defaults to the page's own location", () => {
        expect(logStreamUrl()).toBe(`ws://${window.location.host}/api/admin/logs`);
    });
});

describe("parseLogFrame", () => {
    it("turns a Winston entry into a log entry", () => {
        const frame = JSON.stringify({ level: "warn", message: "disk almost full", timestamp: "2026-09-26T10:29:59Z" });
        expect(parseLogFrame(frame, NOW)).toEqual({
            receivedAt: NOW.toISOString(),
            level: "warn",
            message: "disk almost full",
            timestamp: "2026-09-26T10:29:59Z",
            raw: frame,
        });
    });

    it("has no entry for the subscription confirmation", () => {
        expect(parseLogFrame(JSON.stringify({ id: 0, type: "SUBSCRIBED", success: true, data: "x-logs" }), NOW)).toBeUndefined();
    });

    it("keeps a frame that isn't JSON as an info line", () => {
        expect(parseLogFrame("plain text", NOW)).toEqual({
            receivedAt: NOW.toISOString(),
            level: "info",
            message: "plain text",
            raw: "plain text",
        });
    });

    it("keeps a JSON frame with no level or message as an info line holding the frame", () => {
        const frame = JSON.stringify({ level: 5, message: { a: 1 }, timestamp: 12 });
        expect(parseLogFrame(frame, NOW)).toMatchObject({ level: "info", message: frame, timestamp: undefined });
        expect(parseLogFrame("null", NOW)).toMatchObject({ level: "info", message: "null" });
    });

    it("stamps the entry with the current time by default", () => {
        expect(new Date(parseLogFrame("x")!.receivedAt).getTime()).toBeCloseTo(Date.now(), -3);
    });
});

describe("formatLogLine", () => {
    it("writes the entry's own timestamp when it has one, otherwise the time it was received", () => {
        const entry = { receivedAt: "R", level: "warn", message: "m", raw: "" };
        expect(formatLogLine(entry)).toBe("R WARN  m");
        expect(formatLogLine({ ...entry, timestamp: "T", level: "error" })).toBe("T ERROR m");
    });
});

/** A stand-in for the browser's `WebSocket`, driven from the test. */
class FakeSocket {
    static last: FakeSocket;
    onmessage?: (event: { data: unknown }) => void;
    onclose?: (event: { code: number; reason: string }) => void;
    close = vi.fn();
    constructor(public url: string) {
        FakeSocket.last = this;
    }
}

describe("openLogStream", () => {
    function open() {
        const handlers = { onSubscribed: vi.fn(), onEntry: vi.fn(), onClose: vi.fn() };
        const stream = openLogStream(handlers, (url) => new FakeSocket(url) as unknown as WebSocket);
        return { handlers, stream, socket: FakeSocket.last };
    }

    it("connects to the log socket", () => {
        expect(open().socket.url).toBe(logStreamUrl());
    });

    it("reports the subscription and each entry", () => {
        const { handlers, socket } = open();
        socket.onmessage!({ data: JSON.stringify({ type: "SUBSCRIBED" }) });
        socket.onmessage!({ data: JSON.stringify({ level: "info", message: "hello" }) });
        expect(handlers.onSubscribed).toHaveBeenCalledTimes(1);
        expect(handlers.onEntry).toHaveBeenCalledTimes(1);
        expect(handlers.onEntry.mock.calls[0][0]).toMatchObject({ level: "info", message: "hello" });
    });

    it("reports the server's reason when it closes the socket, or the code when it gives none", () => {
        const first = open();
        first.socket.onclose!({ code: 1002, reason: "api-103" });
        expect(first.handlers.onClose).toHaveBeenCalledWith("api-103");
        const second = open();
        second.socket.onclose!({ code: 1006, reason: "" });
        expect(second.handlers.onClose).toHaveBeenCalledWith("closed (code 1006)");
    });

    it("closes the socket on request, without reporting that as a close", () => {
        const { handlers, stream, socket } = open();
        stream.close();
        expect(socket.close).toHaveBeenCalled();
        socket.onclose!({ code: 1000, reason: "" });
        expect(handlers.onClose).not.toHaveBeenCalled();
    });

    it("opens a real WebSocket by default", () => {
        vi.stubGlobal("WebSocket", FakeSocket);
        const stream = openLogStream({ onSubscribed: vi.fn(), onEntry: vi.fn(), onClose: vi.fn() });
        expect(FakeSocket.last.url).toBe(logStreamUrl());
        stream.close();
    });
});
