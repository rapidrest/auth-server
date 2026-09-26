// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/logStream.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/logStream.js")>();
    return { ...actual, openLogStream: vi.fn() };
});
vi.mock("../../../../apps/shared/lib/diagnostics.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/diagnostics.js")>();
    return { ...actual, downloadText: vi.fn() };
});

import { downloadText } from "../../../../apps/shared/lib/diagnostics.js";
import { LogEntry, LogStreamHandlers, openLogStream } from "../../../../apps/shared/lib/logStream.js";
import LogsCard, { MAX_LOG_ENTRIES } from "../../../../apps/shared/components/admin/diagnostics/LogsCard.js";

const mockedOpen = vi.mocked(openLogStream);
const mockedDownload = vi.mocked(downloadText);

let handlers: LogStreamHandlers;
let streams: { close: ReturnType<typeof vi.fn> }[];

beforeEach(() => {
    streams = [];
    mockedOpen.mockReset();
    mockedDownload.mockReset();
    mockedOpen.mockImplementation((h) => {
        handlers = h;
        const stream = { close: vi.fn() };
        streams.push(stream);
        return stream;
    });
});

afterEach(() => {
    vi.useRealTimers();
});

function entry(level: string, message: string, extra: Partial<LogEntry> = {}): LogEntry {
    return {
        receivedAt: "2026-09-26T10:30:00.000Z",
        level,
        message,
        raw: JSON.stringify({ level, message }),
        ...extra,
    };
}

function push(...entries: LogEntry[]) {
    act(() => entries.forEach((e) => handlers.onEntry(e)));
}

const log = () => screen.getByRole("log", { name: "Service log" });

describe("LogsCard", () => {
    it("connects on mount, waits for entries, and goes live once the server confirms the subscription", () => {
        render(<LogsCard />);
        expect(mockedOpen).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Connecting…")).toBeInTheDocument();
        expect(screen.getByText("Waiting for log entries…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Download capture" })).toBeDisabled();

        act(() => handlers.onSubscribed());
        expect(screen.getByText("Live")).toHaveClass("rr-badge--success");
    });

    it("shows each entry as a line, coloured by its level", () => {
        render(<LogsCard />);
        push(entry("error", "boom", { timestamp: "T1" }), entry("info", "fine"));
        const lines = within(log()).getAllByText(/./);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toHaveTextContent("T1 ERROR boom");
        expect(lines[0]).toHaveClass("rr-diag-log__line--error");
        expect(lines[1]).toHaveTextContent("2026-09-26T10:30:00.000Z INFO fine");
        expect(screen.getByText(/2 entries captured since/)).toBeInTheDocument();
        expect(screen.queryByText("Waiting for log entries…")).toBeNull();
    });

    it("counts a single entry in the singular", () => {
        render(<LogsCard />);
        push(entry("info", "one"));
        expect(screen.getByText(/1 entry captured since/)).toBeInTheDocument();
    });

    it("filters by level and by text in the message", async () => {
        const user = userEvent.setup();
        render(<LogsCard />);
        push(entry("error", "Disk FULL"), entry("info", "started"), entry("info", "disk ok"));

        await user.selectOptions(screen.getByLabelText("Level"), "info");
        expect(within(log()).queryByText(/Disk FULL/)).toBeNull();
        expect(within(log()).getAllByText(/./)).toHaveLength(2);

        await user.type(screen.getByLabelText("Search"), "DISK");
        expect(within(log()).getAllByText(/./)).toHaveLength(1);
        expect(within(log()).getByText(/disk ok/)).toBeInTheDocument();

        await user.clear(screen.getByLabelText("Search"));
        await user.type(screen.getByLabelText("Search"), "nothing");
        expect(screen.getByText("No entries match the filter.")).toBeInTheDocument();
    });

    it("freezes the view when paused, while still capturing, and catches up on resume", async () => {
        const user = userEvent.setup();
        render(<LogsCard />);
        push(entry("info", "before"));

        await user.click(screen.getByRole("button", { name: "Pause" }));
        push(entry("info", "during"));
        expect(within(log()).queryByText(/during/)).toBeNull();
        expect(screen.getByText(/2 entries captured since/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Resume" }));
        expect(within(log()).getByText(/during/)).toBeInTheDocument();
    });

    it("keeps following the newest entry only while Follow is on", async () => {
        const user = userEvent.setup();
        render(<LogsCard />);
        const view = log();
        Object.defineProperty(view, "scrollHeight", { configurable: true, value: 999 });

        push(entry("info", "a"));
        expect(view.scrollTop).toBe(999);

        await user.click(screen.getByLabelText("Follow"));
        view.scrollTop = 5;
        push(entry("info", "b"));
        expect(view.scrollTop).toBe(5);
    });

    it("clears the capture, including from a paused view", async () => {
        const user = userEvent.setup();
        render(<LogsCard />);
        push(entry("info", "one"));
        await user.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByText("Waiting for log entries…")).toBeInTheDocument();
        expect(screen.getByText(/0 entries captured since/)).toBeInTheDocument();

        push(entry("info", "two"));
        await user.click(screen.getByRole("button", { name: "Pause" }));
        await user.click(screen.getByRole("button", { name: "Clear" }));
        expect(within(log()).queryByText(/two/)).toBeNull();
        expect(screen.getByRole("button", { name: "Download capture" })).toBeDisabled();
    });

    it("keeps only the latest entries, and says so", () => {
        render(<LogsCard />);
        act(() => {
            for (let i = 0; i < MAX_LOG_ENTRIES + 3; i++) {
                handlers.onEntry(entry("info", `line ${i}`));
            }
        });
        expect(screen.getByText(new RegExp(`${MAX_LOG_ENTRIES} entries captured since.*latest ${MAX_LOG_ENTRIES} are kept`))).toBeInTheDocument();
        expect(within(log()).queryByText(/line 0$/)).toBeNull();
        expect(within(log()).getByText(new RegExp(`line ${MAX_LOG_ENTRIES + 2}$`))).toBeInTheDocument();
    });

    describe("downloading a capture", () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date("2026-09-26T10:30:05.123Z"));
        });

        it("saves the captured entries as a text file by default — all of them, whatever the filter", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            render(<LogsCard />);
            push(entry("error", "boom", { timestamp: "T1" }), entry("info", "fine"));
            await user.selectOptions(screen.getByLabelText("Level"), "error");

            await user.click(screen.getByRole("button", { name: "Download capture" }));

            expect(mockedDownload).toHaveBeenCalledWith(
                "service-log-20260926-103005.log",
                "T1 ERROR boom\n2026-09-26T10:30:00.000Z INFO  fine\n",
            );
        });

        it("saves the entries exactly as the server sent them, as JSON Lines", async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
            render(<LogsCard />);
            push(entry("error", "boom"), entry("info", "fine"));
            await user.selectOptions(screen.getByLabelText("Download as"), "json");

            await user.click(screen.getByRole("button", { name: "Download capture" }));

            expect(mockedDownload).toHaveBeenCalledWith(
                "service-log-20260926-103005.jsonl",
                '{"level":"error","message":"boom"}\n{"level":"info","message":"fine"}\n',
                "application/x-ndjson",
            );
        });
    });

    describe("when the stream closes", () => {
        it("says why, and reconnects on request", async () => {
            const user = userEvent.setup();
            render(<LogsCard />);
            expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();

            act(() => handlers.onClose("api-103"));
            expect(screen.getByRole("alert")).toHaveTextContent("The log stream closed: api-103");
            expect(screen.getByText("Disconnected")).toBeInTheDocument();

            await user.click(screen.getByRole("button", { name: "Reconnect" }));
            expect(mockedOpen).toHaveBeenCalledTimes(2);
            expect(streams[0].close).toHaveBeenCalled();
            expect(screen.queryByRole("alert")).toBeNull();
            expect(screen.getByText("Connecting…")).toBeInTheDocument();
        });

        it("keeps what was captured", async () => {
            render(<LogsCard />);
            push(entry("info", "kept"));
            act(() => handlers.onClose("closed (code 1006)"));
            expect(within(log()).getByText(/kept/)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Download capture" })).toBeEnabled();
        });
    });

    it("closes the stream when the card goes away", () => {
        const { unmount } = render(<LogsCard />);
        unmount();
        expect(streams[0].close).toHaveBeenCalled();
    });
});
