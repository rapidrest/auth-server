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
    return { ...actual, deleteSiteIcon: vi.fn(), updateSiteSettings: vi.fn(), uploadSiteIcon: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { deleteSiteIcon, updateSiteSettings, uploadSiteIcon } from "../../../../apps/shared/lib/adminApi.js";
import { PublicSiteSettings } from "../../../../apps/shared/lib/siteSettings.js";
import IconCard from "../../../../apps/shared/components/admin/settings/IconCard.js";

const mockedUpdateSiteSettings = vi.mocked(updateSiteSettings);
const mockedUploadSiteIcon = vi.mocked(uploadSiteIcon);
const mockedDeleteSiteIcon = vi.mocked(deleteSiteIcon);

const baseSettings: PublicSiteSettings = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedUpdateSiteSettings.mockReset();
    mockedUploadSiteIcon.mockReset();
    mockedDeleteSiteIcon.mockReset();
});

describe("IconCard", () => {
    it("renders the current icon URL", () => {
        const settings = { ...baseSettings, iconUrl: "https://x/icon.png" };
        render(<IconCard settings={settings} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Icon URL")).toHaveValue("https://x/icon.png");
    });

    it("saves an edited icon URL, converting a blank to null", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, iconUrl: "https://x/new-icon.png" };
        mockedUpdateSiteSettings.mockResolvedValue(updated);

        render(<IconCard settings={baseSettings} onUpdated={onUpdated} />);
        await user.type(screen.getByLabelText("Icon URL"), "https://x/new-icon.png");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSiteSettings).toHaveBeenCalledWith({ iconUrl: "https://x/new-icon.png" });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new ApiRequestError("bad icon", 400));
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("bad icon")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new Error("network down"));
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    it("clicking 'Upload icon image' opens the hidden file picker", async () => {
        const user = userEvent.setup();
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const clickSpy = vi.spyOn(input, "click");

        await user.click(screen.getByRole("button", { name: "Upload icon image" }));

        expect(clickSpy).toHaveBeenCalled();
    });

    it("uploads a selected icon file and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, iconUploaded: true };
        mockedUploadSiteIcon.mockResolvedValue(updated);
        render(<IconCard settings={baseSettings} onUpdated={onUpdated} />);

        const file = new File(["bytes"], "icon.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(mockedUploadSiteIcon).toHaveBeenCalledWith(file);
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when the icon upload fails", async () => {
        const user = userEvent.setup();
        mockedUploadSiteIcon.mockRejectedValue(new ApiRequestError("too big", 413));
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["bytes"], "icon.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("too big")).toBeInTheDocument();
    });

    it("shows a generic message when the icon upload fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUploadSiteIcon.mockRejectedValue(new Error("offline"));
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["bytes"], "icon.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("Could not upload this icon.")).toBeInTheDocument();
    });

    it("shows an uploaded-icon hint, disables the URL field, and offers a remove button when iconUploaded is true", () => {
        render(<IconCard settings={{ ...baseSettings, iconUploaded: true }} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Icon URL")).toBeDisabled();
        expect(screen.getByText(/directly uploaded icon is active/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove uploaded icon" })).toBeInTheDocument();
    });

    it("does not offer a remove button when no icon was uploaded", () => {
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Remove uploaded icon" })).not.toBeInTheDocument();
    });

    it("removes the uploaded icon and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, iconUploaded: false };
        mockedDeleteSiteIcon.mockResolvedValue(updated);
        render(<IconCard settings={{ ...baseSettings, iconUploaded: true }} onUpdated={onUpdated} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded icon" }));

        expect(mockedDeleteSiteIcon).toHaveBeenCalled();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when removing the uploaded icon fails", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteIcon.mockRejectedValue(new ApiRequestError("nope", 500));
        render(<IconCard settings={{ ...baseSettings, iconUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded icon" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when removing the uploaded icon fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteIcon.mockRejectedValue(new Error("offline"));
        render(<IconCard settings={{ ...baseSettings, iconUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded icon" }));

        expect(await screen.findByText("Could not remove this icon.")).toBeInTheDocument();
    });

    it("renders a preview image when an icon is configured", () => {
        render(<IconCard settings={{ ...baseSettings, iconUrl: "https://x/icon.png" }} onUpdated={vi.fn()} />);
        expect(screen.getByAltText("Icon preview")).toHaveAttribute("src", "https://x/icon.png");
    });

    it("renders no preview image when no icon is configured", () => {
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByAltText("Icon preview")).not.toBeInTheDocument();
    });

    it("clears the 'Saved.' indicator once a field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockResolvedValue(baseSettings);
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Icon URL"), "x");
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("does nothing when the file dialog is dismissed with no file chosen", async () => {
        render(<IconCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, "files", { value: [], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(mockedUploadSiteIcon).not.toHaveBeenCalled();
    });
});
