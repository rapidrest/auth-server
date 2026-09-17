// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/systemSettings.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/systemSettings.js")>();
    return { ...actual, updateSystemSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { updateSystemSettings, SystemSettings } from "../../../../apps/shared/lib/systemSettings.js";
import RegistrationCard from "../../../../apps/shared/components/admin/settings/RegistrationCard.js";

const mockedUpdateSystemSettings = vi.mocked(updateSystemSettings);
const baseSettings: SystemSettings = {};

beforeEach(() => {
    mockedUpdateSystemSettings.mockReset();
});

describe("RegistrationCard", () => {
    it("renders the registration switch on when registration is allowed", () => {
        render(<RegistrationCard settings={{ allowRegistration: true }} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).toBeChecked();
    });

    it("treats an unreported allowRegistration as allowed", () => {
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).toBeChecked();
    });

    it("renders the registration switch off when registration is disabled", () => {
        render(<RegistrationCard settings={{ allowRegistration: false }} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).not.toBeChecked();
    });

    it("explains what disabling registration blocks, and that admins can still create users", () => {
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.getByText(/nobody can create an account via sign-up/)).toBeInTheDocument();
        expect(screen.getByText(/Administrators can still create users/)).toBeInTheDocument();
    });

    it("omits the requireMFA switch entirely when the caller can't see it (settings.requireMFA is undefined)", () => {
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        expect(screen.queryByRole("switch", { name: "Require multi-factor authentication" })).not.toBeInTheDocument();
    });

    it("renders the requireMFA switch on when the caller can see it and it's mandated", () => {
        render(<RegistrationCard settings={{ requireMFA: true }} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: "Require multi-factor authentication" })).toBeChecked();
    });

    it("renders the requireMFA switch off when the caller can see it and it's not mandated", () => {
        render(<RegistrationCard settings={{ requireMFA: false }} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: "Require multi-factor authentication" })).not.toBeChecked();
    });

    it("saves both toggles together, unchanged, on a plain Save", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated: SystemSettings = { allowRegistration: true, requireMFA: false };
        mockedUpdateSystemSettings.mockResolvedValue(updated);

        render(<RegistrationCard settings={{ allowRegistration: true, requireMFA: false }} onUpdated={onUpdated} />);
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSystemSettings).toHaveBeenCalledWith({ allowRegistration: true, requireMFA: false });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
    });

    it("saves a disabled registration toggle as allowRegistration: false", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        const updated: SystemSettings = { allowRegistration: false, requireMFA: false };
        mockedUpdateSystemSettings.mockResolvedValue(updated);

        render(
            <RegistrationCard
                settings={{ allowRegistration: true, requireMFA: false }}
                onUpdated={onUpdated}
            />,
        );
        await user.click(screen.getByRole("switch", { name: "Allow new user registration" }));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSystemSettings).toHaveBeenCalledWith({ allowRegistration: false, requireMFA: false });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(onUpdated).toHaveBeenCalledWith(updated);
        expect(screen.getByRole("switch", { name: "Allow new user registration" })).not.toBeChecked();
    });

    it("saves an enabled requireMFA toggle as requireMFA: true", async () => {
        const user = userEvent.setup();
        mockedUpdateSystemSettings.mockResolvedValue({ allowRegistration: true, requireMFA: true });

        render(<RegistrationCard settings={{ allowRegistration: true, requireMFA: false }} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("switch", { name: "Require multi-factor authentication" }));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateSystemSettings).toHaveBeenCalledWith({ allowRegistration: true, requireMFA: true });
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        mockedUpdateSystemSettings.mockRejectedValue(new ApiRequestError("not allowed", 403));
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("not allowed")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedUpdateSystemSettings.mockRejectedValue(new Error("network down"));
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    it("clears the 'Saved.' indicator once a switch changes again", async () => {
        const user = userEvent.setup();
        mockedUpdateSystemSettings.mockResolvedValue(baseSettings);
        render(<RegistrationCard settings={baseSettings} onUpdated={vi.fn()} />);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        await user.click(screen.getByRole("switch", { name: "Allow new user registration" }));
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });
});
