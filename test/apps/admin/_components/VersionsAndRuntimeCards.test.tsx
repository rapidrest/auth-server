// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRuntime, makeVersions } from "./diagnosticsFixtures.js";

vi.mock("../../../../apps/shared/lib/diagnosticsApi.js", () => ({
    getVersions: vi.fn(),
    getRuntime: vi.fn(),
    getSystem: vi.fn(),
}));

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { getRuntime, getVersions } from "../../../../apps/shared/lib/diagnosticsApi.js";
import RuntimeCard from "../../../../apps/shared/components/admin/diagnostics/RuntimeCard.js";
import VersionsCard from "../../../../apps/shared/components/admin/diagnostics/VersionsCard.js";

const mockedGetVersions = vi.mocked(getVersions);
const mockedGetRuntime = vi.mocked(getRuntime);

beforeEach(() => {
    mockedGetVersions.mockReset();
    mockedGetRuntime.mockReset();
});

describe("VersionsCard", () => {
    it("shows a loading state until the versions arrive", () => {
        mockedGetVersions.mockReturnValue(new Promise(() => undefined));
        render(<VersionsCard />);
        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("shows the server's package and Node.js versions", async () => {
        mockedGetVersions.mockResolvedValue(makeVersions());
        render(<VersionsCard />);
        expect(await screen.findByText("auth-server 1.0.0-beta.24")).toBeInTheDocument();
        expect(screen.getByText(/v24\.1\.0/)).toBeInTheDocument();
        expect(screen.getByText("linux x64")).toBeInTheDocument();
    });

    it("lists the datastores with their versions, or why one couldn't be queried", async () => {
        mockedGetVersions.mockResolvedValue(
            makeVersions({
                datastores: [
                    { kind: "mongodb", role: "database", version: "8.0.4" },
                    { kind: "redis", role: "cache", error: "connection refused" },
                    { kind: "mysql", role: "other" },
                ],
            }),
        );
        render(<VersionsCard />);
        // (MongoDB is also the component name of a container, further down.)
        const mongo = (await screen.findAllByRole("cell", { name: "MongoDB" }))[0].closest("tr")!;
        expect(within(mongo).getByText("8.0.4")).toBeInTheDocument();
        const redis = screen.getByRole("cell", { name: "Redis" }).closest("tr")!;
        expect(within(redis).getByText("connection refused")).toBeInTheDocument();
        // A driver with no display name is shown as-is, with no version to show.
        const mysql = screen.getByRole("cell", { name: "mysql" }).closest("tr")!;
        expect(within(mysql).getByText("—")).toBeInTheDocument();
    });

    it("lists every container in the namespace, marking this pod", async () => {
        mockedGetVersions.mockResolvedValue(makeVersions());
        render(<VersionsCard />);
        const own = (await screen.findByRole("cell", { name: /auth-server-abc/ })).closest("tr")!;
        expect(within(own).getByText("this pod")).toBeInTheDocument();
        expect(within(own).getByText("This server")).toBeInTheDocument();
        expect(within(own).getByText("Yes")).toBeInTheDocument();
        const mongo = screen.getByRole("cell", { name: "mongodb" }).closest("tr")!;
        expect(within(mongo).getByText("MongoDB")).toBeInTheDocument();
        expect(within(mongo).getByText("docker.io/bitnami/mongodb:8.0.4")).toBeInTheDocument();
        expect(within(mongo).getByText("No")).toBeInTheDocument();
        expect(within(mongo).getByText("3")).toBeInTheDocument();
        // A container that isn't one of the known components has no component name.
        const other = screen.getByRole("cell", { name: "metrics" }).closest("tr")!;
        expect(within(other).getByText("—")).toBeInTheDocument();
        expect(within(other).queryByText("this pod")).toBeNull();
    });

    it("says so when the server isn't running in Kubernetes", async () => {
        mockedGetVersions.mockResolvedValue(makeVersions({ pods: null }));
        render(<VersionsCard />);
        expect(await screen.findByText("Not running in Kubernetes.")).toBeInTheDocument();
    });

    it("says why the pods couldn't be read", async () => {
        mockedGetVersions.mockResolvedValue(makeVersions({ pods: null, podsError: "/api/v1/pods: HTTP 403" }));
        render(<VersionsCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the namespace's pods: /api/v1/pods: HTTP 403");
    });

    it("lists every installed package and filters them by name", async () => {
        mockedGetVersions.mockResolvedValue(makeVersions());
        const user = userEvent.setup();
        render(<VersionsCard />);
        expect(await screen.findByText("Installed packages (3)")).toBeInTheDocument();
        expect(screen.getAllByRole("cell", { name: "react" })).toHaveLength(2);

        await user.type(screen.getByLabelText("Filter"), " RAPID");
        expect(screen.queryByRole("cell", { name: "react" })).toBeNull();
        expect(screen.getByRole("cell", { name: "@rapidrest/core" })).toBeInTheDocument();

        await user.clear(screen.getByLabelText("Filter"));
        await user.type(screen.getByLabelText("Filter"), "nothing like this");
        expect(screen.getByText("No matching packages.")).toBeInTheDocument();
    });

    it("shows the API's message when the versions can't be loaded, and a generic one otherwise", async () => {
        mockedGetVersions.mockRejectedValueOnce(new ApiRequestError("Forbidden", 403, "api-103"));
        const first = render(<VersionsCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
        first.unmount();

        mockedGetVersions.mockRejectedValueOnce(new Error("network"));
        render(<VersionsCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load version information.");
    });
});

describe("RuntimeCard", () => {
    it("shows a loading state until the runtime arrives", () => {
        mockedGetRuntime.mockReturnValue(new Promise(() => undefined));
        render(<RuntimeCard />);
        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("shows the Kubernetes version, distribution, namespace and pod", async () => {
        mockedGetRuntime.mockResolvedValue(makeRuntime());
        render(<RuntimeCard />);
        expect(await screen.findByText("v1.30.2+k3s1")).toBeInTheDocument();
        expect(screen.getByText("k3s")).toBeInTheDocument();
        expect(screen.getByText("linux/amd64")).toBeInTheDocument();
        expect(screen.getByText("auth-server")).toBeInTheDocument();
        expect(screen.getByText("auth-server-abc")).toBeInTheDocument();
    });

    it("leaves out what the API didn't report", async () => {
        mockedGetRuntime.mockResolvedValue(
            makeRuntime({ podName: undefined, version: { gitVersion: "v1.30.2" } }),
        );
        render(<RuntimeCard />);
        expect(await screen.findByText("v1.30.2")).toBeInTheDocument();
        expect(screen.queryByText("k3s")).toBeNull();
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("says so when the server isn't running in Kubernetes", async () => {
        mockedGetRuntime.mockResolvedValue({ inCluster: false });
        render(<RuntimeCard />);
        expect(await screen.findByText("Not running in Kubernetes.")).toBeInTheDocument();
    });

    it("says why the cluster's version couldn't be read", async () => {
        mockedGetRuntime.mockResolvedValue({ inCluster: true, error: "/version: timed out" });
        render(<RuntimeCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not read the cluster's version: /version: timed out");
    });

    it("shows the API's message when the runtime can't be loaded, and a generic one otherwise", async () => {
        mockedGetRuntime.mockRejectedValueOnce(new ApiRequestError("Forbidden", 403, "api-103"));
        const first = render(<RuntimeCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
        first.unmount();

        mockedGetRuntime.mockRejectedValueOnce(new Error("network"));
        render(<RuntimeCard />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load runtime information.");
    });
});
