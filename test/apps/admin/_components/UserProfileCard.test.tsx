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
    return { ...actual, getUserProfile: vi.fn(), upsertUserProfile: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { getUserProfile, upsertUserProfile } from "../../../../apps/shared/lib/adminApi.js";
import UserProfileCard from "../../../../apps/shared/components/admin/users/detail/UserProfileCard.js";

const mockedGetUserProfile = vi.mocked(getUserProfile);
const mockedUpsertUserProfile = vi.mocked(upsertUserProfile);

beforeEach(() => {
    mockedGetUserProfile.mockReset();
    mockedUpsertUserProfile.mockReset();
});

describe("UserProfileCard", () => {
    it("renders nothing until the initial load settles", () => {
        mockedGetUserProfile.mockReturnValue(new Promise(() => undefined));
        const { container } = render(<UserProfileCard uid="u1" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows a load error when getUserProfile fails", async () => {
        mockedGetUserProfile.mockRejectedValue(new ApiRequestError("boom", 500));
        render(<UserProfileCard uid="u1" />);
        expect(await screen.findByText("boom")).toBeInTheDocument();
    });

    it("shows a generic load error for a non-API failure", async () => {
        mockedGetUserProfile.mockRejectedValue(new Error("network down"));
        render(<UserProfileCard uid="u1" />);
        expect(await screen.findByText("Could not load this account's profile.")).toBeInTheDocument();
    });

    it("populates fields from an existing profile, truncating a timestamp birthdate to a date", async () => {
        mockedGetUserProfile.mockResolvedValue({
            uid: "u1",
            version: 3,
            givenName: "Ada",
            familyName: "Lovelace",
            birthdate: "1990-01-01T08:00:00.000Z",
        });
        render(<UserProfileCard uid="u1" />);
        expect(await screen.findByDisplayValue("Ada")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Lovelace")).toBeInTheDocument();
        expect(screen.getByLabelText("Birthdate")).toHaveValue("1990-01-01");
    });

    it("creates a profile (POST) when none existed", async () => {
        const user = userEvent.setup();
        mockedGetUserProfile.mockResolvedValue(null);
        mockedUpsertUserProfile.mockResolvedValue({ uid: "u1", version: 0, givenName: "Ada" });
        render(<UserProfileCard uid="u1" />);
        await screen.findByRole("button", { name: "Save profile" });
        await user.type(screen.getByLabelText("Given name"), "Ada");
        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(mockedUpsertUserProfile).toHaveBeenCalledWith(
            "u1",
            { givenName: "Ada", familyName: undefined, birthdate: undefined },
            null,
        );
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
    });

    it("updates a profile (PUT) with the existing version when one already exists", async () => {
        const user = userEvent.setup();
        const existing = { uid: "u1", version: 2, givenName: "Ada" };
        mockedGetUserProfile.mockResolvedValue(existing);
        mockedUpsertUserProfile.mockResolvedValue({ ...existing, familyName: "Lovelace" });
        render(<UserProfileCard uid="u1" />);
        await screen.findByDisplayValue("Ada");
        await user.type(screen.getByLabelText("Family name"), "Lovelace");
        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(mockedUpsertUserProfile).toHaveBeenCalledWith(
            "u1",
            { givenName: "Ada", familyName: "Lovelace", birthdate: undefined },
            existing,
        );
    });

    it("saves an edited birthdate and clears the 'Saved.' indicator on further edits", async () => {
        const user = userEvent.setup();
        mockedGetUserProfile.mockResolvedValue(null);
        mockedUpsertUserProfile.mockResolvedValue({ uid: "u1", version: 0, birthdate: "1990-01-01" });
        render(<UserProfileCard uid="u1" />);
        await screen.findByRole("button", { name: "Save profile" });
        await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(mockedUpsertUserProfile).toHaveBeenCalledWith(
            "u1",
            { givenName: undefined, familyName: undefined, birthdate: "1990-01-01" },
            null,
        );
        expect(await screen.findByText("Saved.")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Given name"), "A");
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedGetUserProfile.mockResolvedValue(null);
        mockedUpsertUserProfile.mockRejectedValue(new ApiRequestError("nope", 400));
        render(<UserProfileCard uid="u1" />);
        await screen.findByRole("button", { name: "Save profile" });
        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedGetUserProfile.mockResolvedValue(null);
        mockedUpsertUserProfile.mockRejectedValue(new Error("network down"));
        render(<UserProfileCard uid="u1" />);
        await screen.findByRole("button", { name: "Save profile" });
        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(await screen.findByText("Could not save this account's profile.")).toBeInTheDocument();
    });
});
