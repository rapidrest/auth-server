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
    return { ...actual, updateSiteSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { updateSiteSettings } from "../../../../apps/shared/lib/adminApi.js";
import { PublicSiteSettings } from "../../../../apps/shared/lib/siteSettings.js";
import ContentCard from "../../../../apps/shared/components/admin/settings/ContentCard.js";

const mockedUpdateSiteSettings = vi.mocked(updateSiteSettings);
const baseSettings: PublicSiteSettings = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false };

beforeEach(() => {
    mockedUpdateSiteSettings.mockReset();
});

describe("ContentCard", () => {
    it("renders the current header/footer HTML", () => {
        const settings = { ...baseSettings, headerHtml: "<b>hi</b>", footerHtml: "<i>bye</i>" };
        render(<ContentCard settings={settings} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Header HTML")).toHaveValue("<b>hi</b>");
        expect(screen.getByLabelText("Footer HTML")).toHaveValue("<i>bye</i>");
    });

    it("saves edited header/footer HTML, converting blanks to null", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated = { ...baseSettings, headerHtml: "<p>notice</p>" };
        mockedUpdateSiteSettings.mockResolvedValue(updated);

        render(<ContentCard settings={baseSettings} onUpdated={onUpdated} />);
        await user.type(screen.getByLabelText("Header HTML"), "<p>notice</p>");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSiteSettings).toHaveBeenCalledWith({ headerHtml: "<p>notice</p>", footerHtml: null });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new ApiRequestError("bad html", 400));
        render(<ContentCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("bad html")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockRejectedValue(new Error("network down"));
        render(<ContentCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    it("clears the 'Saved.' indicator once a field changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateSiteSettings.mockResolvedValue(baseSettings);
        render(<ContentCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Footer HTML"), "x");
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });
});
