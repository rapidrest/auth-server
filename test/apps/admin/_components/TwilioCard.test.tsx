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
    return { ...actual, updateTwilioSettings: vi.fn(), resetTwilioSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { resetTwilioSettings, TwilioSettings, updateTwilioSettings } from "../../../../apps/shared/lib/messagingApi.js";
import TwilioCard from "../../../../apps/shared/components/admin/messages/TwilioCard.js";

const mockedUpdate = vi.mocked(updateTwilioSettings);
const mockedReset = vi.mocked(resetTwilioSettings);
const SID = "AC" + "0123456789abcdef".repeat(2);
const OTHER_SID = "AC" + "fedcba9876543210".repeat(2);

const NONE: TwilioSettings = { tokenSet: false, configured: false };
const SAVED: TwilioSettings = { accountSid: SID, tokenSet: true, from: "+15555550100", configured: true };
/** What the deployment's config says, which a reset brings back — deliberately unlike SAVED. */
const FROM_CONFIG: TwilioSettings = { accountSid: SID, tokenSet: true, from: "+15555550199", configured: true };

beforeEach(() => {
    mockedUpdate.mockReset();
    mockedReset.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("TwilioCard", () => {
    it("says whether text messages can be sent", () => {
        const { rerender } = render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);
        expect(screen.getByText(/can't be sent yet: an account SID, an auth token and a sender are all needed/)).toBeInTheDocument();

        rerender(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByText("Text messages are sent with the credentials and sender saved here.")).toBeInTheDocument();
    });

    it("explains that config seeded these, and what's saved here takes over", () => {
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByText(/set from this deployment.s configuration the first time the server started/)).toBeInTheDocument();
    });

    it("shows the saved SID and sender, and never the token: that field starts empty, saying one is saved", () => {
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByLabelText("Account SID")).toHaveValue(SID);
        expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
        const token = screen.getByLabelText("Auth token");
        expect(token).toHaveValue("");
        expect(token).toHaveAttribute("type", "password");
        expect(token).toHaveAttribute("placeholder", "Saved — leave blank to keep it");
    });

    it("has nothing to say in the token field, and empty boxes, when nothing is set", () => {
        render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);

        expect(screen.getByLabelText("Auth token")).toHaveAttribute("placeholder", "");
        expect(screen.getByLabelText("Account SID")).toHaveValue("");
        expect(screen.getByLabelText("Send from")).toHaveValue("");
    });

    it("can't be saved until something has changed", async () => {
        const user = userEvent.setup();
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("Auth token"), "x");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        await user.clear(screen.getByLabelText("Auth token"));
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("Account SID"), "0");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        await user.type(screen.getByLabelText("Account SID"), "{Backspace}");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        await user.type(screen.getByLabelText("Send from"), "1");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("saves everything that was filled in, then clears the token field and reports the new state", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<TwilioCard settings={NONE} onUpdated={onUpdated} />);

        await user.type(screen.getByLabelText("Account SID"), `  ${SID}  `);
        await user.type(screen.getByLabelText("Auth token"), "the-auth-token");
        await user.type(screen.getByLabelText("Send from"), "+15555550100");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ accountSid: SID, token: "the-auth-token", from: "+15555550100" });
        expect(onUpdated).toHaveBeenCalledWith(SAVED);
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(screen.getByLabelText("Auth token")).toHaveValue("");
    });

    it("sends only what changed: not the token when it's blank, and not the parts left alone", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ ...SAVED, accountSid: OTHER_SID });
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Account SID"));
        await user.type(screen.getByLabelText("Account SID"), OTHER_SID);
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ accountSid: OTHER_SID });
    });

    it("saves just the sender when only that changed", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ ...SAVED, from: "Acme" });
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Send from"));
        await user.type(screen.getByLabelText("Send from"), "Acme");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ from: "Acme" });
    });

    it("clears the SID or sender when it's emptied", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ tokenSet: true, configured: false });
        render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Account SID"));
        await user.clear(screen.getByLabelText("Send from"));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ accountSid: null, from: null });
    });

    it("stops saying 'Saved.' when something is typed again", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Auth token"), "t");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findByText("Saved.");

        for (const label of ["Auth token", "Account SID", "Send from"]) {
            await user.type(screen.getByLabelText(label), "x");
            expect(screen.queryByText("Saved."), label).not.toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
        }
    });

    it("shows the server's reason when the settings are refused, and a generic message otherwise", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockRejectedValueOnce(new ApiRequestError("The account SID must be 'AC' followed by 32 hexadecimal digits.", 400));
        render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Account SID"), "nope");

        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText(/must be 'AC' followed by 32 hexadecimal digits/)).toBeInTheDocument();

        mockedUpdate.mockRejectedValueOnce(new Error("network down"));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    describe("removing", () => {
        it("only offers to remove credentials when some are saved", () => {
            const { rerender } = render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Remove saved credentials" })).not.toBeInTheDocument();

            rerender(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<TwilioCard settings={{ tokenSet: true, configured: false }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();
        });

        it("asks first, warning that texts stop, then clears the SID and token but not the sender", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            mockedUpdate.mockResolvedValue({ tokenSet: false, from: "+15555550100", configured: false });
            render(<TwilioCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Text messages will stop"));
            expect(mockedUpdate).toHaveBeenCalledWith({ accountSid: null, token: null });
            expect(onUpdated).toHaveBeenCalledWith({ tokenSet: false, from: "+15555550100", configured: false });
            expect(screen.getByLabelText("Account SID")).toHaveValue("");
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(mockedUpdate).not.toHaveBeenCalled();
        });

        it("shows why removing failed", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

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
            const { unmount } = render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
            unmount();

            render(<TwilioCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
        });

        it("asks first, saying what's lost, then replaces the saved settings with what the server reports", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<TwilioCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(confirm).toHaveBeenCalledWith(
                expect.stringMatching(/Replace the saved Twilio settings with the ones in this deployment's configuration.*is lost.*cleared/),
            );
            expect(mockedReset).toHaveBeenCalledTimes(1);
            expect(mockedUpdate).not.toHaveBeenCalled();
            expect(onUpdated).toHaveBeenCalledWith(FROM_CONFIG);
            expect(screen.getByLabelText("Account SID")).toHaveValue(SID);
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550199");
            expect(screen.getByLabelText("Auth token")).toHaveValue("");
        });

        it("clears anything typed but not saved, and a leftover 'Saved.'", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedUpdate.mockResolvedValue(SAVED);
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Auth token"), "typed-secret");
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
            await user.type(screen.getByLabelText("Auth token"), "more");

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            await waitFor(() => expect(screen.getByLabelText("Auth token")).toHaveValue(""));
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(mockedReset).not.toHaveBeenCalled();
        });

        it("shows why it failed, with the server's reason or a generic message", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

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
            let finish: (value: TwilioSettings) => void = () => undefined;
            mockedReset.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            render(<TwilioCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeDisabled();
            finish(FROM_CONFIG);
            await waitFor(() => expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeEnabled());
        });
    });
});
