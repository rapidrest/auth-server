// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { configure } from "@testing-library/dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// See the identical comment in test/apps/admin/audit-log.test.tsx.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, listAuditLog: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { listAuditLog } from "../../../../apps/shared/lib/adminApi.js";
import UserActivityCard from "../../../../apps/shared/components/admin/users/detail/UserActivityCard.js";

const mockedListAuditLog = vi.mocked(listAuditLog);

beforeEach(() => {
    mockedListAuditLog.mockReset();
});

describe("UserActivityCard", () => {
    it("requests the last 10 entries for the given account", async () => {
        mockedListAuditLog.mockResolvedValue([]);
        render(<UserActivityCard uid="u1" />);
        await screen.findByText("No activity recorded yet.");
        expect(mockedListAuditLog).toHaveBeenCalledWith({ userUid: "u1", limit: 10 });
    });

    it("shows a load error", async () => {
        mockedListAuditLog.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListAuditLog.mockRejectedValue(new Error("network down"));
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("Could not load this account's recent activity.")).toBeInTheDocument();
    });

    it("shows an empty state with no activity", async () => {
        mockedListAuditLog.mockResolvedValue([]);
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
    });

    it("falls back to the raw ISO string in the When column if toLocaleString throws", async () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
            throw new Error("boom");
        });
        mockedListAuditLog.mockResolvedValue([
            { uid: "e1", version: 0, type: "auth.signed_in", userUid: "u1", dateCreated: "2024-01-15T00:00:00.000Z" },
        ]);
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("2024-01-15T00:00:00.000Z")).toBeInTheDocument();
        spy.mockRestore();
    });

    it("renders a row per entry, with its event label, detail, and IP", async () => {
        mockedListAuditLog.mockResolvedValue([
            {
                uid: "e1",
                version: 0,
                type: "auth.signed_in",
                userUid: "u1",
                method: "passkey",
                ip: "1.2.3.4",
                dateCreated: "2026-01-15T00:00:00.000Z",
            },
        ]);
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("Signed in (a passkey)")).toBeInTheDocument();
        expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
    });

    it("renders the data payload as a compact inline detail", async () => {
        mockedListAuditLog.mockResolvedValue([
            {
                uid: "e1",
                version: 0,
                type: "auth.app_password.created",
                userUid: "u1",
                data: { hint: "Mail client" },
                dateCreated: "2026-01-15T00:00:00.000Z",
            },
        ]);
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByText("(hint: Mail client)")).toBeInTheDocument();
    });

    it("shows an em dash for a missing IP", async () => {
        mockedListAuditLog.mockResolvedValue([
            { uid: "e1", version: 0, type: "auth.registration.completed", userUid: "u1", dateCreated: "" },
        ]);
        render(<UserActivityCard uid="u1" />);
        await screen.findByText("Registered");
        expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("links to the actor's account only when it differs from the affected account", async () => {
        mockedListAuditLog.mockResolvedValue([
            {
                uid: "e1",
                version: 0,
                type: "auth.account.deleted",
                userUid: "u1",
                actorUid: "admin-1",
                dateCreated: "",
            },
        ]);
        render(<UserActivityCard uid="u1" />);
        const link = await screen.findByRole("link", { name: "admin-1" });
        expect(link).toHaveAttribute("href", "/admin/users/admin-1");
    });

    it("shows an em dash for the actor when it's the same as the affected account", async () => {
        mockedListAuditLog.mockResolvedValue([
            { uid: "e1", version: 0, type: "auth.signed_in", userUid: "u1", actorUid: "u1", dateCreated: "" },
        ]);
        render(<UserActivityCard uid="u1" />);
        await screen.findByText("Signed in");
        expect(screen.queryByRole("link", { name: "u1" })).not.toBeInTheDocument();
    });

    it('links "View all" to the audit log page pre-filtered to this account', async () => {
        mockedListAuditLog.mockResolvedValue([]);
        render(<UserActivityCard uid="u1" />);
        expect(await screen.findByRole("link", { name: "View all" })).toHaveAttribute(
            "href",
            "/admin/audit-log?userUid=u1",
        );
    });
});
