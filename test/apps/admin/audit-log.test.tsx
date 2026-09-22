// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn() };
});

vi.mock("../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, listAuditLog: vi.fn(), ensureElevated: vi.fn() };
});

import { ApiRequestError, getCurrentUser } from "../../../apps/shared/lib/api.js";
import { AuditLogEntry, ensureElevated, listAuditLog } from "../../../apps/shared/lib/adminApi.js";
import AuditLogPage from "../../../apps/admin/audit-log.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedListAuditLog = vi.mocked(listAuditLog);
const mockedEnsureElevated = vi.mocked(ensureElevated);

const adminSelf = { uid: "admin-1", version: 1, roles: ["admin"], scopes: [] };

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
    return {
        uid: "e1",
        version: 0,
        type: "auth.signed_in",
        userUid: "u1",
        dateCreated: "2026-01-15T00:00:00.000Z",
        ...overrides,
    };
}

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedListAuditLog.mockReset();
    mockedEnsureElevated.mockReset();
    mockedGetCurrentUser.mockResolvedValue(adminSelf);
    mockedEnsureElevated.mockResolvedValue(undefined);
    window.history.pushState({}, "", "/admin/audit-log");
});

describe("AuditLogPage", () => {
    it("loads and renders the first page with default (unfiltered) params", async () => {
        mockedListAuditLog.mockResolvedValue([makeEntry()]);
        render(<AuditLogPage userUid="admin-1" />);
        // The Event filter <select> also has an option labeled "Signed in" (for auth.signed_in), always
        // present regardless of load state — query by role="cell" (the table row, not the <option>) so
        // this genuinely waits for the async listAuditLog() response rather than resolving immediately
        // against the filter control.
        expect(await screen.findByRole("cell", { name: "Signed in" })).toBeInTheDocument();
        expect(mockedListAuditLog).toHaveBeenCalledWith({ userUid: undefined, type: undefined, page: 0, limit: 25 });
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("shows a loading state before the first response resolves", async () => {
        mockedListAuditLog.mockReturnValue(new Promise(() => undefined));
        render(<AuditLogPage userUid="admin-1" />);
        expect(await screen.findByText("Loading…")).toBeInTheDocument();
    });

    it("shows an empty state with no entries", async () => {
        mockedListAuditLog.mockResolvedValue([]);
        render(<AuditLogPage userUid="admin-1" />);
        expect(await screen.findByText("No activity found.")).toBeInTheDocument();
    });

    it("shows a load error", async () => {
        mockedListAuditLog.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<AuditLogPage userUid="admin-1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListAuditLog.mockRejectedValue(new Error("network down"));
        render(<AuditLogPage userUid="admin-1" />);
        expect(await screen.findByText("Could not load the audit log.")).toBeInTheDocument();
    });

    it("falls back to the raw ISO string in the When column if toLocaleString throws", async () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
            throw new Error("boom");
        });
        mockedListAuditLog.mockResolvedValue([makeEntry({ dateCreated: "2024-01-15T00:00:00.000Z" })]);
        render(<AuditLogPage userUid="admin-1" />);
        expect(await screen.findByText("2024-01-15T00:00:00.000Z")).toBeInTheDocument();
        spy.mockRestore();
    });

    it("renders When/Event/Account/Actor/IP/Detail columns for a full entry", async () => {
        mockedListAuditLog.mockResolvedValue([
            makeEntry({
                type: "auth.app_password.used",
                userUid: "u1",
                actorUid: "admin-9",
                ip: "1.2.3.4",
                data: { hint: "Mail client" },
            }),
        ]);
        render(<AuditLogPage userUid="admin-1" />);

        // Same reasoning as above — this label also exists as an Event filter <option>.
        expect(await screen.findByRole("cell", { name: "Signed in with an app password" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "u1" })).toHaveAttribute("href", "/admin/users/u1");
        expect(screen.getByRole("link", { name: "admin-9" })).toHaveAttribute("href", "/admin/users/admin-9");
        expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
        expect(screen.getByText("hint: Mail client")).toBeInTheDocument();
    });

    it("shows em dashes for account, actor, IP, and detail when absent", async () => {
        mockedListAuditLog.mockResolvedValue([
            makeEntry({ userUid: undefined, actorUid: undefined, ip: undefined, dateCreated: "" }),
        ]);
        render(<AuditLogPage userUid="admin-1" />);
        await screen.findByRole("cell", { name: "Signed in" });
        // Account, Actor, IP, and Detail each render an em dash when absent.
        expect(screen.getAllByText("—").length).toBe(4);
    });

    it("does not show an actor when it matches the affected account", async () => {
        mockedListAuditLog.mockResolvedValue([makeEntry({ userUid: "u1", actorUid: "u1" })]);
        render(<AuditLogPage userUid="admin-1" />);
        await screen.findByRole("cell", { name: "Signed in" });
        expect(screen.queryByRole("link", { name: "u1" })).toBeInTheDocument(); // Account column link
        expect(screen.getAllByRole("link", { name: "u1" })).toHaveLength(1); // not also as Actor
    });

    it("seeds filters from the URL query string on mount, deep-linking from a user's activity card", async () => {
        window.history.pushState({}, "", "/admin/audit-log?userUid=u1&type=auth.signed_in");
        mockedListAuditLog.mockResolvedValue([]);
        render(<AuditLogPage userUid="admin-1" />);
        await waitFor(() =>
            expect(mockedListAuditLog).toHaveBeenCalledWith({
                userUid: "u1",
                type: "auth.signed_in",
                page: 0,
                limit: 25,
            }),
        );
        expect(screen.getByLabelText("Account")).toHaveValue("u1");
        expect(screen.getByLabelText("Event")).toHaveValue("auth.signed_in");
    });

    it("applies the Account and Event filters on submit, resetting to page 0", async () => {
        mockedListAuditLog.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<AuditLogPage userUid="admin-1" />);
        await screen.findByText("No activity found.");

        await user.type(screen.getByLabelText("Account"), "u2");
        await user.selectOptions(screen.getByLabelText("Event"), "auth.mfa.enrolled");
        await user.click(screen.getByRole("button", { name: "Filter" }));

        await waitFor(() =>
            expect(mockedListAuditLog).toHaveBeenLastCalledWith({
                userUid: "u2",
                type: "auth.mfa.enrolled",
                page: 0,
                limit: 25,
            }),
        );
    });

    it("enables Next when a full page is returned, and pages forward/backward", async () => {
        mockedListAuditLog.mockResolvedValue(Array.from({ length: 25 }, (_, i) => makeEntry({ uid: `e${i}` })));
        const user = userEvent.setup();
        render(<AuditLogPage userUid="admin-1" />);
        await waitFor(() => expect(screen.getByRole("button", { name: "Next" })).toBeEnabled());

        await user.click(screen.getByRole("button", { name: "Next" }));
        await waitFor(() => expect(mockedListAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
        expect(screen.getByText("Page 2")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Previous" }));
        await waitFor(() => expect(mockedListAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 })));
    });
});
