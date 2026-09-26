// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSystem } from "./diagnosticsFixtures.js";

vi.mock("../../../../apps/shared/lib/diagnosticsApi.js", () => ({
    getVersions: vi.fn(),
    getRuntime: vi.fn(),
    getSystem: vi.fn(),
}));

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { getSystem, SystemResponse } from "../../../../apps/shared/lib/diagnosticsApi.js";
import SystemCard from "../../../../apps/shared/components/admin/diagnostics/SystemCard.js";

const mockedGetSystem = vi.mocked(getSystem);

beforeEach(() => {
    mockedGetSystem.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

/** Lets the pending promise chains settle, without advancing any timers. */
async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

function withKubernetes(patch: Partial<NonNullable<SystemResponse["kubernetes"]>>): SystemResponse {
    const system = makeSystem();
    return { ...system, kubernetes: { ...system.kubernetes!, ...patch } };
}

describe("SystemCard", () => {
    it("shows a loading state before the first snapshot arrives", () => {
        mockedGetSystem.mockReturnValue(new Promise(() => undefined));
        render(<SystemCard />);
        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("shows this server's CPU, memory, uptime and disks", async () => {
        mockedGetSystem.mockResolvedValue(makeSystem());
        render(<SystemCard />);

        expect(await screen.findByText("50.0%")).toBeInTheDocument();
        expect(screen.getByText(/2 available/)).toBeInTheDocument();
        expect(screen.getByText(/load 0\.50 0\.25 0\.10/)).toBeInTheDocument();
        // 50% of one core on two cores.
        expect(screen.getByRole("meter", { name: "CPU" })).toHaveAttribute("aria-valuenow", "25");
        // The same figure is this pod's memory in the namespace table below.
        expect(screen.getAllByText("256 MiB")[0]).toHaveClass("rr-diag-stat__value");
        expect(screen.getByText(/of 512 MiB container limit/)).toBeInTheDocument();
        expect(screen.getByText(/heap 100 MiB of 150 MiB/)).toBeInTheDocument();
        expect(screen.getByRole("meter", { name: "Memory" })).toHaveAttribute("aria-valuenow", "50");
        expect(screen.getByText("1d 2h")).toBeInTheDocument();

        const app = screen.getByRole("cell", { name: "/app" }).closest("tr")!;
        expect(within(app).getAllByText("5.0 GiB")).toHaveLength(2);
        expect(within(app).getByText("10.0 GiB")).toBeInTheDocument();
        expect(screen.getByRole("meter", { name: "/app usage" })).toHaveAttribute("aria-valuenow", "50");
        // A filesystem reporting no size at all shows as empty rather than dividing by zero.
        expect(screen.getByRole("meter", { name: "/data usage" })).toHaveAttribute("aria-valuenow", "0");
    });

    it("measures memory against the host's when the container has no limit", async () => {
        const system = makeSystem();
        system.server.memory.containerLimitBytes = undefined;
        mockedGetSystem.mockResolvedValue(system);
        render(<SystemCard />);
        expect(await screen.findByText(/of 16\.0 GiB on the host/)).toBeInTheDocument();
    });

    it("handles a host reporting no memory at all", async () => {
        const system = makeSystem();
        system.server.memory.containerLimitBytes = undefined;
        system.server.memory.systemTotalBytes = 0;
        mockedGetSystem.mockResolvedValue(system);
        render(<SystemCard />);
        expect(await screen.findByRole("meter", { name: "Memory" })).toHaveAttribute("aria-valuenow", "0");
    });

    it("caps the CPU meter at full", async () => {
        const system = makeSystem();
        system.server.cpu.processPercent = 900;
        mockedGetSystem.mockResolvedValue(system);
        render(<SystemCard />);
        expect(await screen.findByRole("meter", { name: "CPU" })).toHaveAttribute("aria-valuenow", "100");
    });

    it("shows each datastore's storage, or why it couldn't be queried", async () => {
        mockedGetSystem.mockResolvedValue(makeSystem());
        render(<SystemCard />);
        const mongo = (await screen.findByRole("cell", { name: "mongodb (database)" })).closest("tr")!;
        expect(within(mongo).getByText("1.0 GiB")).toBeInTheDocument();
        expect(within(mongo).getByText("8.0 GiB")).toBeInTheDocument();
        expect(within(mongo).getByRole("meter", { name: "mongodb usage" })).toHaveAttribute("aria-valuenow", "13");
        // No capacity reported (Redis without maxmemory): the figure alone, with no meter.
        const redis = screen.getByRole("cell", { name: "redis (cache)" }).closest("tr")!;
        expect(within(redis).getByText("1.0 MiB")).toBeInTheDocument();
        expect(within(redis).queryByRole("meter")).toBeNull();
        const failed = screen.getByRole("cell", { name: "postgresql (other)" }).closest("tr")!;
        expect(within(failed).getByText("connection refused")).toBeInTheDocument();
    });

    it("shows the namespace's live use, its pods and its volume claims", async () => {
        mockedGetSystem.mockResolvedValue(makeSystem());
        render(<SystemCard />);
        expect(await screen.findByText("Namespace auth-server")).toBeInTheDocument();
        // 250m + 500m of CPU, 256Mi + 512Mi of memory, across the two pods.
        expect(screen.getByText("750m")).toBeInTheDocument();
        expect(screen.getByText("768 MiB")).toBeInTheDocument();
        expect(screen.getByText("100m requested")).toBeInTheDocument();
        expect(screen.getByText("384 MiB requested")).toBeInTheDocument();

        const own = screen.getByRole("cell", { name: /auth-server-abc/ }).closest("tr")!;
        expect(within(own).getByText("this pod")).toBeInTheDocument();
        expect(within(own).getByText("(100m / —)")).toBeInTheDocument();
        expect(within(own).getByText("(384 MiB / 1.0 GiB)")).toBeInTheDocument();
        // (This pod also appears as what mounts the claim, below.)
        const other = screen.getAllByRole("cell", { name: "mongodb-0" })[0].closest("tr")!;
        expect(within(other).queryByText("this pod")).toBeNull();

        const claim = screen.getByRole("cell", { name: "datadir-mongodb-0" }).closest("tr")!;
        expect(within(claim).getByText("8.0 GiB")).toBeInTheDocument();
        expect(within(claim).getByText("local-path")).toBeInTheDocument();
        expect(within(claim).getByText("mongodb-0")).toBeInTheDocument();
        const orphan = screen.getByRole("cell", { name: "orphan" }).closest("tr")!;
        expect(within(orphan).getAllByText("—")).toHaveLength(3);
        expect(screen.queryByText(/metrics-server/)).toBeNull();
    });

    it("explains when live pod usage isn't available", async () => {
        const system = withKubernetes({ metricsAvailable: false });
        system.kubernetes!.pods = system.kubernetes!.pods.map((pod) => ({ ...pod, cpuCores: undefined, memoryBytes: undefined }));
        mockedGetSystem.mockResolvedValue(system);
        render(<SystemCard />);
        expect(await screen.findByText(/no metrics-server/)).toBeInTheDocument();
    });

    it("says why the namespace couldn't be read, instead of the metrics explanation", async () => {
        mockedGetSystem.mockResolvedValue(withKubernetes({ metricsAvailable: false, error: "pods: HTTP 403", pods: [], pvcs: [] }));
        render(<SystemCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the namespace: pods: HTTP 403");
        expect(screen.queryByText(/no metrics-server/)).toBeNull();
        expect(screen.getByText("No persistent volume claims.")).toBeInTheDocument();
    });

    it("says so when the server isn't running in Kubernetes", async () => {
        mockedGetSystem.mockResolvedValue(makeSystem({ kubernetes: null }));
        render(<SystemCard />);
        expect(await screen.findByText("Not running in Kubernetes.")).toBeInTheDocument();
        expect(screen.getByText("Namespace")).toBeInTheDocument();
    });

    it("shows an error in place of the first snapshot: the API's message, or a generic one", async () => {
        mockedGetSystem.mockRejectedValueOnce(new ApiRequestError("Forbidden", 403, "api-103"));
        const first = render(<SystemCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
        first.unmount();

        mockedGetSystem.mockRejectedValueOnce(new Error("network"));
        render(<SystemCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load system information.");
    });

    describe("live polling", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("polls at the chosen interval, keeps a history, and stops and resumes on request", async () => {
            const cpu = [10, 20, 30, 40];
            let call = 0;
            mockedGetSystem.mockImplementation(async () => {
                const system = makeSystem();
                system.server.cpu.processPercent = cpu[Math.min(call++, cpu.length - 1)];
                return system;
            });
            const { container } = render(<SystemCard />);
            await flush();
            expect(mockedGetSystem).toHaveBeenCalledTimes(1);
            expect(screen.getByText(/Live/)).toBeInTheDocument();
            // One sample: nothing to draw yet.
            expect(container.querySelector('svg[aria-label="CPU history"] polyline')).toBeNull();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(mockedGetSystem).toHaveBeenCalledTimes(2);
            expect(screen.getByText("20.0%")).toBeInTheDocument();
            expect(container.querySelector('svg[aria-label="CPU history"] polyline')).not.toBeNull();
            expect(container.querySelector('svg[aria-label="Namespace CPU history"] polyline')).not.toBeNull();

            // A faster interval takes effect straight away.
            fireEvent.change(screen.getByLabelText("Refresh every"), { target: { value: "2000" } });
            await flush();
            expect(mockedGetSystem).toHaveBeenCalledTimes(3);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(mockedGetSystem).toHaveBeenCalledTimes(4);

            fireEvent.click(screen.getByRole("button", { name: "Pause" }));
            expect(screen.getByText(/Paused/)).toBeInTheDocument();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(60000);
            });
            expect(mockedGetSystem).toHaveBeenCalledTimes(4);

            fireEvent.click(screen.getByRole("button", { name: "Resume" }));
            await flush();
            expect(mockedGetSystem).toHaveBeenCalledTimes(5);
        });

        it("keeps only the latest samples", async () => {
            mockedGetSystem.mockImplementation(async () => makeSystem());
            const { container } = render(<SystemCard />);
            await flush();
            for (let i = 0; i < 70; i++) {
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(5000);
                });
            }
            const points = container.querySelector('svg[aria-label="CPU history"] polyline')!.getAttribute("points")!;
            expect(points.split(" ")).toHaveLength(60);
        });

        it("keeps showing the last snapshot, with an error, when a later poll fails, and clears it on recovery", async () => {
            mockedGetSystem.mockResolvedValueOnce(makeSystem());
            mockedGetSystem.mockRejectedValueOnce(new ApiRequestError("Service unavailable", 503));
            mockedGetSystem.mockResolvedValue(makeSystem());
            render(<SystemCard />);
            await flush();
            expect(screen.getByText("50.0%")).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
            expect(screen.getByText("50.0%")).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(screen.queryByRole("alert")).toBeNull();
        });

        it("ignores a response that arrives after the card is gone", async () => {
            let resolve!: (system: SystemResponse) => void;
            let reject!: (err: Error) => void;
            mockedGetSystem.mockReturnValueOnce(new Promise((r) => (resolve = r)));
            const first = render(<SystemCard />);
            first.unmount();
            await act(async () => resolve(makeSystem()));

            mockedGetSystem.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
            const second = render(<SystemCard />);
            second.unmount();
            await act(async () => reject(new Error("late")));
            // Nothing to assert on a removed component but that neither settle threw.
            expect(mockedGetSystem).toHaveBeenCalledTimes(2);
        });
    });
});
