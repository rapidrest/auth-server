// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRuntime, makeSystem, makeVersions } from "./_components/diagnosticsFixtures.js";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, ensureElevated: vi.fn() };
});

vi.mock("../../../apps/shared/lib/diagnosticsApi.js", () => ({
    getVersions: vi.fn(),
    getRuntime: vi.fn(),
    getSystem: vi.fn(),
}));

vi.mock("../../../apps/shared/lib/logStream.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/logStream.js")>();
    return { ...actual, openLogStream: vi.fn(() => ({ close: vi.fn() })) };
});

import { getCurrentUser } from "../../../apps/shared/lib/api.js";
import { ensureElevated } from "../../../apps/shared/lib/adminApi.js";
import { getRuntime, getSystem, getVersions } from "../../../apps/shared/lib/diagnosticsApi.js";
import { openLogStream } from "../../../apps/shared/lib/logStream.js";
import DiagnosticsPage from "../../../apps/admin/diagnostics.js";

beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({ uid: "admin-1", version: 1, roles: ["admin"], scopes: [] });
    vi.mocked(ensureElevated).mockResolvedValue(undefined);
    vi.mocked(getVersions).mockReset().mockResolvedValue(makeVersions());
    vi.mocked(getRuntime).mockReset().mockResolvedValue(makeRuntime());
    vi.mocked(getSystem).mockReset().mockResolvedValue(makeSystem());
    vi.mocked(openLogStream).mockClear();
    window.history.pushState({}, "", "/admin/diagnostics");
});

describe("DiagnosticsPage", () => {
    it("opens on the versions, with the Kubernetes runtime above them", async () => {
        render(<DiagnosticsPage userUid="admin-1" />);
        expect(await screen.findByText("v1.30.2+k3s1")).toBeInTheDocument();
        expect(await screen.findByText("auth-server 1.0.0-beta.24")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Versions" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Live usage" })).toHaveAttribute("aria-selected", "false");
        // Nothing live runs until asked for.
        expect(getSystem).not.toHaveBeenCalled();
        expect(openLogStream).not.toHaveBeenCalled();
    });

    it("switches to the live usage, and to the service log, starting each only when opened", async () => {
        const user = userEvent.setup();
        render(<DiagnosticsPage userUid="admin-1" />);
        await screen.findByText("auth-server 1.0.0-beta.24");

        await user.click(screen.getByRole("tab", { name: "Live usage" }));
        expect(await screen.findByText("This server")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Live usage" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "diag-tab-usage");
        expect(getSystem).toHaveBeenCalledTimes(1);
        expect(screen.queryByText("auth-server 1.0.0-beta.24")).toBeNull();

        await user.click(screen.getByRole("tab", { name: "Service log" }));
        expect(await screen.findByRole("log", { name: "Service log" })).toBeInTheDocument();
        expect(openLogStream).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("tab", { name: "Versions" }));
        expect(await screen.findByText("auth-server 1.0.0-beta.24")).toBeInTheDocument();
    });

    it("is framed by the admin console with Diagnostics highlighted", async () => {
        render(<DiagnosticsPage userUid="admin-1" />);
        await screen.findByText("auth-server 1.0.0-beta.24");
        expect(screen.getByRole("link", { name: "Diagnostics" })).toHaveAttribute("aria-current", "page");
    });
});
