// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, updateUser: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { AdminUser, updateUser } from "../../../../apps/shared/lib/adminApi.js";
import UserOverviewCard from "../../../../apps/shared/components/admin/users/detail/UserOverviewCard.js";

const mockedUpdateUser = vi.mocked(updateUser);

const baseUser: AdminUser = {
    uid: "u1",
    roles: ["admin"],
    scopes: [],
    verified: false,
    version: 1,
    dateCreated: "2024-01-15T00:00:00.000Z",
    dateModified: "2024-01-16T00:00:00.000Z",
};

beforeEach(() => {
    mockedUpdateUser.mockReset();
});

describe("UserOverviewCard", () => {
    it("renders the account's uid, dates, roles, scopes, and verified state", () => {
        render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        expect(screen.getByText("u1")).toBeInTheDocument();
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.getByLabelText("Verified")).not.toBeChecked();
    });

    it("saves roles/scopes/verified edits and reports the updated user", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseUser, roles: ["admin", "editor"], verified: true, version: 2 };
        mockedUpdateUser.mockResolvedValue(updated);

        render(<UserOverviewCard user={baseUser} onUpdated={onUpdated} />);
        await user.type(screen.getByPlaceholderText("e.g. admin"), "editor{Enter}");
        await user.click(screen.getByLabelText("Verified"));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateUser).toHaveBeenCalledWith({
            uid: "u1",
            version: 1,
            roles: ["admin", "editor"],
            scopes: [],
            verified: true,
        });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("clears the 'Saved.' indicator once a field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateUser.mockResolvedValue(baseUser);
        render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.click(screen.getByLabelText("Verified"));
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateUser.mockRejectedValue(new ApiRequestError("stale version", 409));
        render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("stale version")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateUser.mockRejectedValue(new Error("network down"));
        render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save this account.")).toBeInTheDocument();
    });

    it("renders an empty date when dateCreated/dateModified are missing", () => {
        const user = { ...baseUser, dateCreated: "", dateModified: "" };
        const { container } = render(<UserOverviewCard user={user} onUpdated={vi.fn()} />);
        const dds = container.querySelectorAll("dd");
        expect(dds[1]).toHaveTextContent("");
        expect(dds[2]).toHaveTextContent("");
    });

    it("falls back to the raw ISO string if toLocaleString throws", () => {
        const spy = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => {
            throw new Error("boom");
        });
        render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        expect(screen.getByText(baseUser.dateCreated)).toBeInTheDocument();
        spy.mockRestore();
    });

    it("tolerates a malformed API response with roles/scopes/verified missing", () => {
        // AdminUser's `roles`/`scopes` are typed as required and `verified` as boolean, but nothing at
        // runtime guarantees the server actually sends them — the `?? []`/`!!` fallbacks below are a
        // boundary safety net for that, hence the cast to simulate what a real malformed response looks like.
        const malformedUser = { ...baseUser, roles: undefined, scopes: undefined, verified: undefined } as unknown as AdminUser;
        render(<UserOverviewCard user={malformedUser} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Verified")).not.toBeChecked();
        expect(screen.queryByText("admin")).not.toBeInTheDocument();
    });

    it("reseeds its fields when a different account is loaded", () => {
        const { rerender } = render(<UserOverviewCard user={baseUser} onUpdated={vi.fn()} />);
        expect(screen.getByText("u1")).toBeInTheDocument();
        const otherUser: AdminUser = { ...baseUser, uid: "u2", roles: ["viewer"], verified: true };
        rerender(<UserOverviewCard user={otherUser} onUpdated={vi.fn()} />);
        expect(screen.getByText("u2")).toBeInTheDocument();
        expect(screen.getByText("viewer")).toBeInTheDocument();
        expect(screen.getByLabelText("Verified")).toBeChecked();
    });
});
