// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ComponentsTable, { imageReference, mainContainer } from "../../../../../apps/shared/components/admin/diagnostics/ComponentsTable.js";
import PackagesTable, { PACKAGES_PAGE_SIZE } from "../../../../../apps/shared/components/admin/diagnostics/PackagesTable.js";
import ServerVersionCard from "../../../../../apps/shared/components/admin/diagnostics/ServerVersionCard.js";
import VersionsPanel from "../../../../../apps/shared/components/admin/diagnostics/VersionsPanel.js";
import type { DiagnosticsComponent, DiagnosticsVersions } from "../../../../../apps/shared/components/admin/diagnostics/diagnosticsApi.js";
import { runningComponent, versionsFixture } from "./fixtures.js";

describe("ServerVersionCard", () => {
    it("shows Node.js, the package, the machine and the uptime", () => {
        render(<ServerVersionCard server={versionsFixture().server} />);
        const card = within(screen.getByRole("region", { name: "Server" }));
        expect(card.getByText("v24.1.0")).toBeInTheDocument();
        expect(card.getByText("13.6.233")).toBeInTheDocument();
        expect(card.getByText("auth-server 1.0.0-beta.25")).toBeInTheDocument();
        expect(card.getByText("production")).toBeInTheDocument();
        expect(card.getByText("linux / x64")).toBeInTheDocument();
        expect(card.getByText("auth-server-abc")).toBeInTheDocument();
        expect(card.getByText("17")).toBeInTheDocument();
        expect(card.getByText(new Date("2026-09-25T10:00:00.000Z").toLocaleString())).toBeInTheDocument();
        expect(card.getByText("1d 1h")).toBeInTheDocument();
    });

    it("writes a dash for what the server left out", () => {
        render(<ServerVersionCard server={{} as DiagnosticsVersions["server"]} />);
        const card = within(screen.getByRole("region", { name: "Server" }));
        expect(card.getAllByText("—")).toHaveLength(9);
    });

    it("writes the package name alone when the version is missing", () => {
        render(<ServerVersionCard server={{ packageName: "auth-server" } as DiagnosticsVersions["server"]} />);
        expect(screen.getByText("auth-server")).toBeInTheDocument();
    });
});

describe("PackagesTable", () => {
    const packages = Array.from({ length: 250 }, (_, index) => ({
        name: `pkg-${String(index).padStart(3, "0")}`,
        version: `1.0.${index}`,
        direct: index % 50 === 0,
    }));

    it("lists a page at a time, with a badge on the direct dependencies", async () => {
        const user = userEvent.setup();
        render(<PackagesTable packages={packages} />);
        expect(screen.getByRole("status")).toHaveTextContent("250 packages");
        expect(screen.getAllByRole("row")).toHaveLength(PACKAGES_PAGE_SIZE + 1);
        expect(screen.getAllByText("direct")).toHaveLength(2);
        expect(screen.getByText("Showing 100 of 250")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Show more" }));
        expect(screen.getAllByRole("row")).toHaveLength(201);
        await user.click(screen.getByRole("button", { name: "Show more" }));
        expect(screen.getAllByRole("row")).toHaveLength(251);
        expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("filters by name or version, and starts again from the first page", async () => {
        const user = userEvent.setup();
        render(<PackagesTable packages={packages} />);
        await user.click(screen.getByRole("button", { name: "Show more" }));
        await user.type(screen.getByRole("searchbox", { name: "Filter packages" }), "PKG-24");
        expect(screen.getByRole("status")).toHaveTextContent("10 of 250 packages match");
        expect(screen.getAllByRole("row")).toHaveLength(11);
        expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();

        await user.clear(screen.getByRole("searchbox", { name: "Filter packages" }));
        await user.type(screen.getByRole("searchbox", { name: "Filter packages" }), "1.0.7");
        expect(screen.getByRole("status")).toHaveTextContent("11 of 250 packages match");

        await user.clear(screen.getByRole("searchbox", { name: "Filter packages" }));
        expect(screen.getAllByRole("row")).toHaveLength(PACKAGES_PAGE_SIZE + 1);
    });

    it("can show only the direct dependencies", async () => {
        const user = userEvent.setup();
        render(<PackagesTable packages={packages} />);
        await user.click(screen.getByRole("button", { name: "Show more" }));
        await user.click(screen.getByRole("checkbox", { name: "Direct dependencies only" }));
        expect(screen.getByRole("status")).toHaveTextContent("5 of 250 packages match");
        expect(screen.getAllByRole("row")).toHaveLength(6);
        await user.click(screen.getByRole("checkbox", { name: "Direct dependencies only" }));
        expect(screen.getAllByRole("row")).toHaveLength(PACKAGES_PAGE_SIZE + 1);
    });

    it("says when nothing matches", async () => {
        const user = userEvent.setup();
        render(<PackagesTable packages={packages} />);
        await user.type(screen.getByRole("searchbox", { name: "Filter packages" }), "no such package");
        expect(screen.getByText("No packages match.")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});

describe("ComponentsTable", () => {
    it("lists each component with its status, version, image, short digest, restarts and node", () => {
        render(<ComponentsTable components={versionsFixture().components} kubernetes={{ available: true }} />);
        const rows = screen.getAllByRole("row");
        expect(rows).toHaveLength(4);

        const mongodb = within(rows.find((row) => within(row).queryByText("mongodb"))!);
        expect(mongodb.getByText("Running")).toBeInTheDocument();
        expect(mongodb.getByText("1.0")).toBeInTheDocument();
        expect(mongodb.getByText("docker.io/library/mongodb")).toBeInTheDocument();
        expect(mongodb.getByText("0123456789ab")).toHaveAttribute("title", "sha256:0123456789abcdef0123456789abcdef");
        expect(mongodb.getByText("2")).toBeInTheDocument();
        expect(mongodb.getByText("node-1")).toBeInTheDocument();

        const postgresql = within(rows.find((row) => within(row).queryByText("postgresql"))!);
        expect(postgresql.getByText("Not found")).toBeInTheDocument();
        expect(postgresql.queryByText(/pod/)).not.toBeInTheDocument();
        expect(postgresql.getAllByText("—").length).toBeGreaterThanOrEqual(5);

        const redis = within(rows.find((row) => within(row).queryByText("redis"))!);
        expect(redis.getByText("Not ready")).toBeInTheDocument();
    });

    it("gives the detail of each pod and container", async () => {
        const user = userEvent.setup();
        const component: DiagnosticsComponent = {
            component: "mongodb",
            status: "running",
            version: "8.0",
            pods: [
                { ...runningComponent("mongodb", "8.0").pods[0], restarts: 1, ready: false },
                {
                    name: "mongodb-1",
                    phase: "Pending",
                    ready: false,
                    restarts: 0,
                    containers: [{ name: "mongodb", image: "mongo:8.0", tag: "8.0", ready: false, restartCount: 0 }, { name: "bare", image: "bare", ready: true, restartCount: 1 }],
                },
            ],
        };
        render(<ComponentsTable components={[component]} kubernetes={{ available: true }} />);
        await user.click(screen.getByText("2 pods"));
        expect(screen.getByText("mongodb-0")).toBeInTheDocument();
        expect(screen.getByText(/Running . not ready . 1 restart . on node-1 . started/)).toBeInTheDocument();
        expect(screen.getByText(/sidecar: example\/sidecar:0.1 . ready . 0 restarts/)).toBeInTheDocument();
        expect(screen.getByText(/mongodb: docker.io\/library\/mongodb:8.0 @0123456789ab . ready . 2 restarts/)).toBeInTheDocument();
        expect(screen.getByText("mongodb-1")).toBeInTheDocument();
        expect(screen.getByText(/Pending . not ready . 0 restarts$/)).toBeInTheDocument();
        // A tag already in the image is not written twice; no tag and no digest is just the image.
        expect(screen.getByText(/mongodb: mongo:8.0 . not ready/)).toBeInTheDocument();
        expect(screen.getByText(/bare: bare . ready . 1 restart$/)).toBeInTheDocument();
    });

    it("names one pod in the singular", () => {
        render(<ComponentsTable components={[runningComponent("redis", "7")]} kubernetes={{ available: true }} />);
        expect(screen.getByText("1 pod")).toBeInTheDocument();
    });

    it("treats a status it does not know as unknown", () => {
        const odd = { component: "redis", status: "weird", pods: [] } as unknown as DiagnosticsComponent;
        render(<ComponentsTable components={[odd]} kubernetes={{ available: true }} />);
        expect(screen.getByText("Unknown")).toBeInTheDocument();
    });

    it("says Kubernetes is not available, with the reason, instead of a table of unknowns", () => {
        render(<ComponentsTable components={versionsFixture().components} kubernetes={{ available: false, reason: "No service account." }} />);
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Kubernetes information is not available on this server.");
        expect(screen.getByText("No service account.")).toBeInTheDocument();
    });

    it("picks the container that runs the version, else the first", () => {
        const component = runningComponent("redis", "7");
        expect(mainContainer(component)?.name).toBe("redis");
        expect(mainContainer({ ...component, version: undefined })?.name).toBe("sidecar");
        expect(mainContainer({ ...component, version: "9" })?.name).toBe("sidecar");
        expect(mainContainer({ ...component, pods: [] })).toBeUndefined();
        expect(imageReference({ name: "a", image: "x", tag: "1", ready: true, restartCount: 0 })).toBe("x:1");
        expect(imageReference({ name: "a", image: "x:1", tag: "1", ready: true, restartCount: 0 })).toBe("x:1");
        expect(imageReference({ name: "a", image: "x", ready: true, restartCount: 0 })).toBe("x");
    });
});

describe("VersionsPanel", () => {
    const idle = { data: undefined, error: undefined, loading: false };

    it("shows the server, the containers and the packages", () => {
        render(<VersionsPanel versions={{ data: versionsFixture(), error: undefined, loading: false }} />);
        for (const name of ["Server", "Other containers", "Installed packages"]) {
            expect(screen.getByRole("region", { name })).toBeInTheDocument();
        }
    });

    it("says it is loading, and shows an error", () => {
        const { rerender } = render(<VersionsPanel versions={{ ...idle, loading: true }} />);
        expect(screen.getByText(/Loading/)).toBeInTheDocument();
        rerender(<VersionsPanel versions={{ ...idle, error: "Nope." }} />);
        expect(screen.getByText("Nope.")).toBeInTheDocument();
        expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    });

    it("copes with a server that leaves out the lists", () => {
        const sparse = { server: versionsFixture().server } as DiagnosticsVersions;
        render(<VersionsPanel versions={{ data: sparse, error: undefined, loading: false }} />);
        expect(screen.getByText("0 packages")).toBeInTheDocument();
        // No kubernetes field is read as Kubernetes being unavailable.
        expect(screen.getByText("Kubernetes information is not available on this server.")).toBeInTheDocument();
    });
});
