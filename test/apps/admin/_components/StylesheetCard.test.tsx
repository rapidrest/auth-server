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
    return { ...actual, deleteSiteStylesheet: vi.fn(), updateSiteSettings: vi.fn(), uploadSiteStylesheet: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { deleteSiteStylesheet, updateSiteSettings, uploadSiteStylesheet } from "../../../../apps/shared/lib/adminApi.js";
import { PublicSiteSettings } from "../../../../apps/shared/lib/siteSettings.js";
import StylesheetCard from "../../../../apps/shared/components/admin/settings/StylesheetCard.js";

const mockedUpdateSiteSettings = vi.mocked(updateSiteSettings);
const mockedUploadSiteStylesheet = vi.mocked(uploadSiteStylesheet);
const mockedDeleteSiteStylesheet = vi.mocked(deleteSiteStylesheet);

const baseSettings: PublicSiteSettings = { logoUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedUpdateSiteSettings.mockReset();
    mockedUploadSiteStylesheet.mockReset();
    mockedDeleteSiteStylesheet.mockReset();
});

describe("StylesheetCard", () => {
    it("renders the current stylesheet URL", () => {
        render(<StylesheetCard settings={{ ...baseSettings, stylesheetUrl: "https://x/style.css" }} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Stylesheet URL")).toHaveValue("https://x/style.css");
    });

    it("saves the edited stylesheet URL, converting a blank to null", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, stylesheetUrl: "https://x/style.css" };
        mockedUpdateSiteSettings.mockResolvedValue(updated);

        render(<StylesheetCard settings={baseSettings} onUpdated={onUpdated} />);
        await user.type(screen.getByLabelText("Stylesheet URL"), "https://x/style.css");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSiteSettings).toHaveBeenCalledWith({ stylesheetUrl: "https://x/style.css" });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new ApiRequestError("bad url", 400));
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("bad url")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new Error("network down"));
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    it("clicking 'Upload stylesheet' opens the hidden file picker", async () => {
        const user = userEvent.setup();
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const clickSpy = vi.spyOn(input, "click");

        await user.click(screen.getByRole("button", { name: "Upload stylesheet" }));

        expect(clickSpy).toHaveBeenCalled();
    });

    it("uploads a selected stylesheet file and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, stylesheetUploaded: true };
        mockedUploadSiteStylesheet.mockResolvedValue(updated);
        render(<StylesheetCard settings={baseSettings} onUpdated={onUpdated} />);

        const file = new File(["body{}"], "style.css", { type: "text/css" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(mockedUploadSiteStylesheet).toHaveBeenCalledWith(file);
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when the stylesheet upload fails", async () => {
        const user = userEvent.setup();
        mockedUploadSiteStylesheet.mockRejectedValue(new ApiRequestError("too big", 413));
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["body{}"], "style.css", { type: "text/css" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("too big")).toBeInTheDocument();
    });

    it("shows a generic message when the stylesheet upload fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUploadSiteStylesheet.mockRejectedValue(new Error("offline"));
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["body{}"], "style.css", { type: "text/css" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("Could not upload this stylesheet.")).toBeInTheDocument();
    });

    it("shows an uploaded-stylesheet hint, disables the URL field, and offers a remove button", () => {
        render(<StylesheetCard settings={{ ...baseSettings, stylesheetUploaded: true }} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Stylesheet URL")).toBeDisabled();
        expect(screen.getByText(/directly uploaded stylesheet is active/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove uploaded stylesheet" })).toBeInTheDocument();
    });

    it("does not offer a remove button when no stylesheet was uploaded", () => {
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Remove uploaded stylesheet" })).not.toBeInTheDocument();
    });

    it("removes the uploaded stylesheet and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, stylesheetUploaded: false };
        mockedDeleteSiteStylesheet.mockResolvedValue(updated);
        render(<StylesheetCard settings={{ ...baseSettings, stylesheetUploaded: true }} onUpdated={onUpdated} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded stylesheet" }));

        expect(mockedDeleteSiteStylesheet).toHaveBeenCalled();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when removing the uploaded stylesheet fails", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteStylesheet.mockRejectedValue(new ApiRequestError("nope", 500));
        render(<StylesheetCard settings={{ ...baseSettings, stylesheetUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded stylesheet" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when removing the uploaded stylesheet fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteStylesheet.mockRejectedValue(new Error("offline"));
        render(<StylesheetCard settings={{ ...baseSettings, stylesheetUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded stylesheet" }));

        expect(await screen.findByText("Could not remove this stylesheet.")).toBeInTheDocument();
    });

    it("clears the 'Saved.' indicator once the field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockResolvedValue(baseSettings);
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Stylesheet URL"), "x");
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("does nothing when the file dialog is dismissed with no file chosen", async () => {
        render(<StylesheetCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, "files", { value: [], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(mockedUploadSiteStylesheet).not.toHaveBeenCalled();
    });
});
