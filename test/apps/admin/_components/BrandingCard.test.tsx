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
    return { ...actual, deleteSiteLogo: vi.fn(), updateSiteSettings: vi.fn(), uploadSiteLogo: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { deleteSiteLogo, updateSiteSettings, uploadSiteLogo } from "../../../../apps/shared/lib/adminApi.js";
import { PublicSiteSettings } from "../../../../apps/shared/lib/siteSettings.js";
import BrandingCard from "../../../../apps/shared/components/admin/settings/BrandingCard.js";

const mockedUpdateSiteSettings = vi.mocked(updateSiteSettings);
const mockedUploadSiteLogo = vi.mocked(uploadSiteLogo);
const mockedDeleteSiteLogo = vi.mocked(deleteSiteLogo);

const baseSettings: PublicSiteSettings = { logoUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedUpdateSiteSettings.mockReset();
    mockedUploadSiteLogo.mockReset();
    mockedDeleteSiteLogo.mockReset();
});

describe("BrandingCard", () => {
    it("renders the current site title, company name, and logo URL", () => {
        const settings = { ...baseSettings, siteTitle: "Acme Auth", companyName: "Acme Inc", logoUrl: "https://x/logo.png" };
        render(<BrandingCard settings={settings} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Site title")).toHaveValue("Acme Auth");
        expect(screen.getByLabelText("Company name")).toHaveValue("Acme Inc");
        expect(screen.getByLabelText("Logo URL")).toHaveValue("https://x/logo.png");
    });

    it("saves edited text fields, converting blanks to null", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, siteTitle: "New Title" };
        mockedUpdateSiteSettings.mockResolvedValue(updated);

        render(<BrandingCard settings={baseSettings} onUpdated={onUpdated} />);
        await user.type(screen.getByLabelText("Site title"), "New Title");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSiteSettings).toHaveBeenCalledWith({ siteTitle: "New Title", companyName: null, logoUrl: null });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new ApiRequestError("bad title", 400));
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("bad title")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new Error("network down"));
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    it("saves an edited logo URL", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        mockedUpdateSiteSettings.mockResolvedValue({ ...baseSettings, logoUrl: "https://x/new-logo.png" });

        render(<BrandingCard settings={baseSettings} onUpdated={onUpdated} />);
        await user.type(screen.getByLabelText("Logo URL"), "https://x/new-logo.png");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSiteSettings).toHaveBeenCalledWith(
            expect.objectContaining({ logoUrl: "https://x/new-logo.png" }),
        );
    });

    it("clicking 'Upload logo image' opens the hidden file picker", async () => {
        const user = userEvent.setup();
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const clickSpy = vi.spyOn(input, "click");

        await user.click(screen.getByRole("button", { name: "Upload logo image" }));

        expect(clickSpy).toHaveBeenCalled();
    });

    it("uploads a selected logo file and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, logoUploaded: true };
        mockedUploadSiteLogo.mockResolvedValue(updated);
        render(<BrandingCard settings={baseSettings} onUpdated={onUpdated} />);

        const file = new File(["bytes"], "logo.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(mockedUploadSiteLogo).toHaveBeenCalledWith(file);
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when the logo upload fails", async () => {
        const user = userEvent.setup();
        mockedUploadSiteLogo.mockRejectedValue(new ApiRequestError("too big", 413));
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["bytes"], "logo.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("too big")).toBeInTheDocument();
    });

    it("shows a generic message when the logo upload fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUploadSiteLogo.mockRejectedValue(new Error("offline"));
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);

        const file = new File(["bytes"], "logo.png", { type: "image/png" });
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        await user.upload(input, file);

        expect(await screen.findByText("Could not upload this logo.")).toBeInTheDocument();
    });

    it("shows an uploaded-logo hint, disables the URL field, and offers a remove button when logoUploaded is true", () => {
        render(<BrandingCard settings={{ ...baseSettings, logoUploaded: true }} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Logo URL")).toBeDisabled();
        expect(screen.getByText(/directly uploaded logo is active/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove uploaded logo" })).toBeInTheDocument();
    });

    it("does not offer a remove button when no logo was uploaded", () => {
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Remove uploaded logo" })).not.toBeInTheDocument();
    });

    it("removes the uploaded logo and reports the updated settings", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, logoUploaded: false };
        mockedDeleteSiteLogo.mockResolvedValue(updated);
        render(<BrandingCard settings={{ ...baseSettings, logoUploaded: true }} onUpdated={onUpdated} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded logo" }));

        expect(mockedDeleteSiteLogo).toHaveBeenCalled();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows an error when removing the uploaded logo fails", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteLogo.mockRejectedValue(new ApiRequestError("nope", 500));
        render(<BrandingCard settings={{ ...baseSettings, logoUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded logo" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when removing the uploaded logo fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedDeleteSiteLogo.mockRejectedValue(new Error("offline"));
        render(<BrandingCard settings={{ ...baseSettings, logoUploaded: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: "Remove uploaded logo" }));

        expect(await screen.findByText("Could not remove this logo.")).toBeInTheDocument();
    });

    it("renders a preview image when a logo is configured", () => {
        render(<BrandingCard settings={{ ...baseSettings, logoUrl: "https://x/logo.png" }} onUpdated={vi.fn()} />);
        expect(screen.getByAltText("Logo preview")).toHaveAttribute("src", "https://x/logo.png");
    });

    it("renders no preview image when no logo is configured", () => {
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByAltText("Logo preview")).not.toBeInTheDocument();
    });

    it("clears the 'Saved.' indicator once a field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockResolvedValue(baseSettings);
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Company name"), "x");
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("does nothing when the file dialog is dismissed with no file chosen", async () => {
        render(<BrandingCard settings={baseSettings} onUpdated={vi.fn()} />);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, "files", { value: [], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(mockedUploadSiteLogo).not.toHaveBeenCalled();
    });
});
