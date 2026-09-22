// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/messagingApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/messagingApi.js")>();
    return { ...actual, updateWhatsAppSettings: vi.fn(), resetWhatsAppSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { resetWhatsAppSettings, updateWhatsAppSettings, WhatsAppSettings } from "../../../../apps/shared/lib/messagingApi.js";
import WhatsAppCard from "../../../../apps/shared/components/admin/messages/WhatsAppCard.js";

const mockedUpdate = vi.mocked(updateWhatsAppSettings);
const mockedReset = vi.mocked(resetWhatsAppSettings);

const NONE: WhatsAppSettings = { accessTokenSet: false, configured: false };
const SAVED: WhatsAppSettings = { phoneNumberId: "109876543210", accessTokenSet: true, apiVersion: "v23.0", configured: true };
/** What the deployment's config says, which a reset brings back — deliberately unlike SAVED. */
const FROM_CONFIG: WhatsAppSettings = { phoneNumberId: "100000000001", accessTokenSet: true, configured: true };

beforeEach(() => {
    mockedUpdate.mockReset();
    mockedReset.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("WhatsAppCard", () => {
    it("says whether WhatsApp messages can be sent", () => {
        const { rerender } = render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);
        expect(screen.getByText("WhatsApp")).toBeInTheDocument();
        expect(screen.getByText(/can't be sent yet: a phone number ID and an access token are both needed/)).toBeInTheDocument();

        rerender(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByText("WhatsApp messages are sent with the phone number and access token saved here.")).toBeInTheDocument();
    });

    it("explains what the phone number ID is, and that codes to people who haven't written recently need a template", () => {
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByText(/isn.t the phone number itself/)).toBeInTheDocument();
        expect(screen.getByText(/only delivers a free-form message to someone who has messaged you in the last 24 hours/)).toBeInTheDocument();
        expect(screen.getByText(/set an approved WhatsApp message template on that message.s\s+page/)).toBeInTheDocument();
    });

    it("explains that config seeded these, and what's saved here takes over", () => {
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByText(/set from this deployment.s configuration the first time the server started/)).toBeInTheDocument();
    });

    it("shows the saved phone number ID and API version, and never the token: that field starts empty, saying one is saved", () => {
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByLabelText("Phone number ID")).toHaveValue("109876543210");
        expect(screen.getByLabelText("API version")).toHaveValue("v23.0");
        const token = screen.getByLabelText("Access token");
        expect(token).toHaveValue("");
        expect(token).toHaveAttribute("type", "password");
        expect(token).toHaveAttribute("placeholder", "Saved — leave blank to keep it");
    });

    it("has nothing to say in the token field, and empty boxes, when nothing is set", () => {
        render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);

        expect(screen.getByLabelText("Access token")).toHaveAttribute("placeholder", "");
        expect(screen.getByLabelText("Phone number ID")).toHaveValue("");
        const version = screen.getByLabelText("API version");
        expect(version).toHaveValue("");
        expect(version).toHaveAttribute("placeholder", "v23.0");
        expect(screen.getByText("Optional. Leave blank for the default.")).toBeInTheDocument();
    });

    it("can't be saved until something has changed", async () => {
        const user = userEvent.setup();
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("Access token"), "x");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        await user.clear(screen.getByLabelText("Access token"));
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("Phone number ID"), "0");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        await user.type(screen.getByLabelText("Phone number ID"), "{Backspace}");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("API version"), "1");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("saves everything that was filled in, then clears the token field and reports the new state", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<WhatsAppCard settings={NONE} onUpdated={onUpdated} />);

        await user.type(screen.getByLabelText("Phone number ID"), "  109876543210  ");
        await user.type(screen.getByLabelText("Access token"), "the-access-token");
        await user.type(screen.getByLabelText("API version"), "v23.0");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ phoneNumberId: "109876543210", accessToken: "the-access-token", apiVersion: "v23.0" });
        expect(onUpdated).toHaveBeenCalledWith(SAVED);
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(screen.getByLabelText("Access token")).toHaveValue("");
    });

    it("sends only what changed: not the token when it's blank, and not the parts left alone", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ ...SAVED, phoneNumberId: "100000000001" });
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Phone number ID"));
        await user.type(screen.getByLabelText("Phone number ID"), "100000000001");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ phoneNumberId: "100000000001" });
    });

    it("saves just the token when only that was typed", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.type(screen.getByLabelText("Access token"), "rotated");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ accessToken: "rotated" });
    });

    it("clears the phone number ID or API version when it's emptied", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ accessTokenSet: true, configured: false });
        render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Phone number ID"));
        await user.clear(screen.getByLabelText("API version"));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ phoneNumberId: null, apiVersion: null });
    });

    it("stops saying 'Saved.' when something is typed again", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Access token"), "t");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findByText("Saved.");

        for (const label of ["Access token", "Phone number ID", "API version"]) {
            await user.type(screen.getByLabelText(label), "1");
            expect(screen.queryByText("Saved."), label).not.toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
        }
    });

    it("shows the server's reason when the settings are refused, and a generic message otherwise", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockRejectedValueOnce(new ApiRequestError("The phone number ID must be a number of 5 to 32 digits.", 400));
        render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Phone number ID"), "nope");

        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText(/must be a number of 5 to 32 digits/)).toBeInTheDocument();

        mockedUpdate.mockRejectedValueOnce(new Error("network down"));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    describe("removing", () => {
        it("only offers to remove credentials when some are saved", () => {
            const { rerender } = render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Remove saved credentials" })).not.toBeInTheDocument();

            rerender(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<WhatsAppCard settings={{ accessTokenSet: true, configured: false }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();
        });

        it("asks first, warning that messages stop, then clears the phone number ID and token but not the API version", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            const after: WhatsAppSettings = { accessTokenSet: false, apiVersion: "v23.0", configured: false };
            mockedUpdate.mockResolvedValue(after);
            render(<WhatsAppCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(confirm).toHaveBeenCalledWith(expect.stringContaining("WhatsApp messages will stop"));
            expect(mockedUpdate).toHaveBeenCalledWith({ phoneNumberId: null, accessToken: null });
            expect(onUpdated).toHaveBeenCalledWith(after);
            expect(screen.getByLabelText("Phone number ID")).toHaveValue("");
            expect(screen.getByLabelText("API version")).toHaveValue("v23.0");
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(mockedUpdate).not.toHaveBeenCalled();
        });

        it("shows why removing failed", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

            mockedUpdate.mockRejectedValueOnce(new ApiRequestError("Elevation required.", 403));
            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));
            expect(await screen.findByText("Elevation required.")).toBeInTheDocument();

            mockedUpdate.mockRejectedValueOnce(new Error("network down"));
            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));
            expect(await screen.findByText("Could not remove these credentials.")).toBeInTheDocument();
        });
    });

    describe("resetting to configuration", () => {
        it("is always offered, whether or not anything is saved", () => {
            const { unmount } = render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
            unmount();

            render(<WhatsAppCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
        });

        it("asks first, saying what's lost, then replaces the saved settings with what the server reports", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<WhatsAppCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(confirm).toHaveBeenCalledWith(
                expect.stringMatching(/Replace the saved WhatsApp settings with the ones in this deployment's configuration.*is lost.*cleared/),
            );
            expect(mockedReset).toHaveBeenCalledTimes(1);
            expect(mockedUpdate).not.toHaveBeenCalled();
            expect(onUpdated).toHaveBeenCalledWith(FROM_CONFIG);
            expect(screen.getByLabelText("Phone number ID")).toHaveValue("100000000001");
            expect(screen.getByLabelText("API version")).toHaveValue("");
            expect(screen.getByLabelText("Access token")).toHaveValue("");
        });

        it("clears anything typed but not saved, and a leftover 'Saved.'", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedUpdate.mockResolvedValue(SAVED);
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Access token"), "typed-secret");
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
            await user.type(screen.getByLabelText("Access token"), "more");

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            await waitFor(() => expect(screen.getByLabelText("Access token")).toHaveValue(""));
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(mockedReset).not.toHaveBeenCalled();
        });

        it("shows why it failed, with the server's reason or a generic message", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

            mockedReset.mockRejectedValueOnce(new ApiRequestError("A secret can't be stored: the encryption key is missing.", 500));
            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));
            expect(await screen.findByText(/A secret can't be stored/)).toBeInTheDocument();

            mockedReset.mockRejectedValueOnce(new Error("network down"));
            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));
            expect(await screen.findByText("Could not reset these settings.")).toBeInTheDocument();
        });

        it("disables every button while it's in flight", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            let finish: (value: WhatsAppSettings) => void = () => undefined;
            mockedReset.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            render(<WhatsAppCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeDisabled();
            finish(FROM_CONFIG);
            await waitFor(() => expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeEnabled());
        });
    });
});
