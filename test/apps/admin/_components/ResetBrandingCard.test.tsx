// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, resetSiteSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { resetSiteSettings } from "../../../../apps/shared/lib/adminApi.js";
import ResetBrandingCard from "../../../../apps/shared/components/admin/settings/ResetBrandingCard.js";

const mockedResetSiteSettings = vi.mocked(resetSiteSettings);

beforeEach(() => {
    mockedResetSiteSettings.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ResetBrandingCard", () => {
    it("does nothing when the confirmation is dismissed", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(false);
        const user = userEvent.setup();
        render(<ResetBrandingCard onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

        expect(mockedResetSiteSettings).not.toHaveBeenCalled();
    });

    it("resets the branding and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false, siteTitle: "RapidMX" };
        mockedResetSiteSettings.mockResolvedValue(updated);

        render(<ResetBrandingCard onUpdated={onUpdated} />);
        await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

        expect(mockedResetSiteSettings).toHaveBeenCalled();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows the ApiRequestError message when resetting fails", async () => {
        const user = userEvent.setup();
        mockedResetSiteSettings.mockRejectedValue(new ApiRequestError("no encryption key", 500));
        render(<ResetBrandingCard onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

        expect(await screen.findByText("no encryption key")).toBeInTheDocument();
    });

    it("shows a generic message when resetting fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedResetSiteSettings.mockRejectedValue(new Error("offline"));
        render(<ResetBrandingCard onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

        expect(await screen.findByText("Could not reset the branding.")).toBeInTheDocument();
    });
});
