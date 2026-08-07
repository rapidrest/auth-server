// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, deleteAlias: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, listUserAliases: vi.fn(), createUserAlias: vi.fn() };
});

import { ApiRequestError, deleteAlias } from "../../../../apps/shared/lib/api.js";
import { createUserAlias, listUserAliases } from "../../../../apps/shared/lib/adminApi.js";
import UserIdentifiersCard from "../../../../apps/shared/components/admin/users/detail/UserIdentifiersCard.js";

const mockedListUserAliases = vi.mocked(listUserAliases);
const mockedCreateUserAlias = vi.mocked(createUserAlias);
const mockedDeleteAlias = vi.mocked(deleteAlias);

beforeEach(() => {
    mockedListUserAliases.mockReset();
    mockedCreateUserAlias.mockReset();
    mockedDeleteAlias.mockReset();
    window.confirm = vi.fn(() => true);
});

describe("UserIdentifiersCard", () => {
    it("shows a load error when listing aliases fails", async () => {
        mockedListUserAliases.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<UserIdentifiersCard uid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedListUserAliases.mockRejectedValue(new Error("network down"));
        render(<UserIdentifiersCard uid="u1" />);
        expect(await screen.findByText("Could not load this account's identifiers.")).toBeInTheDocument();
    });

    it("shows an empty state when there are no identifiers", async () => {
        mockedListUserAliases.mockResolvedValue([]);
        render(<UserIdentifiersCard uid="u1" />);
        expect(await screen.findByText("No identifiers on this account.")).toBeInTheDocument();
    });

    it("renders a row per identifier with type and verified status", async () => {
        mockedListUserAliases.mockResolvedValue([
            { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: false },
        ]);
        render(<UserIdentifiersCard uid="u1" />);
        expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
        const row = screen.getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByText("Email")).toBeInTheDocument();
        expect(within(row).getByText("Unverified")).toBeInTheDocument();
    });

    it("does nothing when the add form is submitted with a blank value", async () => {
        const user = userEvent.setup();
        mockedListUserAliases.mockResolvedValue([]);
        render(<UserIdentifiersCard uid="u1" />);
        await screen.findByText("No identifiers on this account.");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(mockedCreateUserAlias).not.toHaveBeenCalled();
    });

    it("adds an identifier and appends it to the list", async () => {
        const user = userEvent.setup();
        mockedListUserAliases.mockResolvedValue([]);
        mockedCreateUserAlias.mockResolvedValue({
            uid: "a1",
            version: 0,
            alias: "newadmin",
            type: "name",
            userUid: "u1",
            verified: true,
        });
        render(<UserIdentifiersCard uid="u1" />);
        await screen.findByText("No identifiers on this account.");
        await user.selectOptions(screen.getByLabelText("Type"), "name");
        await user.type(screen.getByLabelText("Value"), "newadmin");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(mockedCreateUserAlias).toHaveBeenCalledWith("u1", "name", "newadmin");
        expect(await screen.findByText("newadmin")).toBeInTheDocument();
        expect(screen.getByLabelText("Value")).toHaveValue("");
    });

    it("shows an add error when creating the alias fails", async () => {
        const user = userEvent.setup();
        mockedListUserAliases.mockResolvedValue([]);
        mockedCreateUserAlias.mockRejectedValue(new ApiRequestError("taken", 403));
        render(<UserIdentifiersCard uid="u1" />);
        await screen.findByText("No identifiers on this account.");
        await user.type(screen.getByLabelText("Value"), "dup@example.com");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(await screen.findByText("taken")).toBeInTheDocument();
    });

    it("shows a generic add error for a non-API failure", async () => {
        const user = userEvent.setup();
        mockedListUserAliases.mockResolvedValue([]);
        mockedCreateUserAlias.mockRejectedValue(new Error("network down"));
        render(<UserIdentifiersCard uid="u1" />);
        await screen.findByText("No identifiers on this account.");
        await user.type(screen.getByLabelText("Value"), "dup@example.com");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(await screen.findByText("Could not add that identifier.")).toBeInTheDocument();
    });

    it("does nothing when removal is declined", async () => {
        window.confirm = vi.fn(() => false);
        mockedListUserAliases.mockResolvedValue([
            { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: false },
        ]);
        const user = userEvent.setup();
        render(<UserIdentifiersCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(mockedDeleteAlias).not.toHaveBeenCalled();
    });

    it("removes an identifier after confirmation", async () => {
        mockedListUserAliases.mockResolvedValue([
            { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: false },
        ]);
        mockedDeleteAlias.mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(<UserIdentifiersCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(mockedDeleteAlias).toHaveBeenCalledWith("a1");
        await waitFor(() => expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument());
    });

    it("shows an error when removal fails", async () => {
        mockedListUserAliases.mockResolvedValue([
            { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: false },
        ]);
        mockedDeleteAlias.mockRejectedValue(new ApiRequestError("nope", 500));
        const user = userEvent.setup();
        render(<UserIdentifiersCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic error when removal fails with a non-API error", async () => {
        mockedListUserAliases.mockResolvedValue([
            { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: false },
        ]);
        mockedDeleteAlias.mockRejectedValue(new Error("network down"));
        const user = userEvent.setup();
        render(<UserIdentifiersCard uid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that identifier.")).toBeInTheDocument();
    });
});
