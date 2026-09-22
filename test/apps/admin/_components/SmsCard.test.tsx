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
    return { ...actual, updateSmsSettings: vi.fn(), resetSmsSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { resetSmsSettings, SmsSettings, updateSmsSettings } from "../../../../apps/shared/lib/messagingApi.js";
import SmsCard from "../../../../apps/shared/components/admin/messages/SmsCard.js";

const mockedUpdate = vi.mocked(updateSmsSettings);
const mockedReset = vi.mocked(resetSmsSettings);
const SID = "AC" + "0123456789abcdef".repeat(2);
const OTHER_SID = "AC" + "fedcba9876543210".repeat(2);

/** Nothing saved, and no provider chosen yet. */
const NONE: SmsSettings = { twilio: { tokenSet: false }, telnyx: { apiKeySet: false }, configured: false };
const TWILIO_SAVED: SmsSettings = {
    provider: "twilio",
    twilio: { accountSid: SID, tokenSet: true },
    telnyx: { apiKeySet: false },
    from: "+15555550100",
    configured: true,
};
/** Telnyx sends, and Twilio's credentials are still saved but unused. */
const TELNYX_SAVED: SmsSettings = {
    provider: "telnyx",
    twilio: { accountSid: SID, tokenSet: true },
    telnyx: { apiKeySet: true, messagingProfileId: "profile-1" },
    from: "+15555550100",
    configured: true,
};
/** What the deployment's config says, which a reset brings back — deliberately unlike the saved settings. */
const FROM_CONFIG: SmsSettings = { ...TWILIO_SAVED, from: "+15555550199" };

beforeEach(() => {
    mockedUpdate.mockReset();
    mockedReset.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SmsCard", () => {
    it("says whether text messages can be sent", () => {
        const { rerender } = render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
        expect(screen.getByText("Text messages (SMS)")).toBeInTheDocument();
        expect(screen.getByText(/can't be sent yet: a provider, its credentials and a sender are all needed/)).toBeInTheDocument();

        rerender(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByText("Text messages are sent with the provider, credentials and sender saved here.")).toBeInTheDocument();
    });

    it("explains that config seeded these, and what's saved here takes over", () => {
        render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByText(/set from this deployment.s configuration the first time the server started/)).toBeInTheDocument();
    });

    describe("the provider", () => {
        it("offers Twilio and Telnyx, and explains that only one sends texts at a time", () => {
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            const select = screen.getByLabelText("Provider");
            expect(Array.from((select as HTMLSelectElement).options).map((o) => [o.value, o.text])).toEqual([
                ["twilio", "Twilio"],
                ["telnyx", "Telnyx"],
            ]);
            expect(screen.getByText(/Only one provider sends text messages at a time/)).toBeInTheDocument();
            expect(screen.getByText(/keeps the credentials saved for this one, but they aren.t used until you switch back/)).toBeInTheDocument();
        });

        it("starts on the saved provider, and on Twilio when none has been chosen", () => {
            const { unmount } = render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByLabelText("Provider")).toHaveValue("telnyx");
            unmount();

            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.getByLabelText("Provider")).toHaveValue("twilio");
        });

        it("shows only the selected provider's fields, and the sender for both", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByLabelText("Account SID")).toBeInTheDocument();
            expect(screen.getByLabelText("Auth token")).toBeInTheDocument();
            expect(screen.queryByLabelText("API key")).not.toBeInTheDocument();
            expect(screen.queryByLabelText("Messaging profile ID")).not.toBeInTheDocument();
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");

            expect(screen.getByLabelText("API key")).toBeInTheDocument();
            expect(screen.getByLabelText("Messaging profile ID")).toBeInTheDocument();
            expect(screen.queryByLabelText("Account SID")).not.toBeInTheDocument();
            expect(screen.queryByLabelText("Auth token")).not.toBeInTheDocument();
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
        });

        it("keeps what was typed for a provider while another one is selected", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Account SID"), "AC-typed");

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.selectOptions(screen.getByLabelText("Provider"), "twilio");

            expect(screen.getByLabelText("Account SID")).toHaveValue("AC-typed");
        });
    });

    describe("Twilio", () => {
        it("shows the saved SID and sender, and never the token: that field starts empty, saying one is saved", () => {
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            expect(screen.getByLabelText("Account SID")).toHaveValue(SID);
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
            const token = screen.getByLabelText("Auth token");
            expect(token).toHaveValue("");
            expect(token).toHaveAttribute("type", "password");
            expect(token).toHaveAttribute("placeholder", "Saved — leave blank to keep it");
        });

        it("has nothing to say in the token field, and empty boxes, when nothing is set", () => {
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);

            expect(screen.getByLabelText("Auth token")).toHaveAttribute("placeholder", "");
            expect(screen.getByLabelText("Account SID")).toHaveValue("");
            expect(screen.getByLabelText("Send from")).toHaveValue("");
        });

        it("saves everything that was filled in, then clears the token field and reports the new state", async () => {
            const user = userEvent.setup();
            const onUpdated = vi.fn();
            mockedUpdate.mockResolvedValue(TWILIO_SAVED);
            render(<SmsCard settings={NONE} onUpdated={onUpdated} />);

            await user.type(screen.getByLabelText("Account SID"), `  ${SID}  `);
            await user.type(screen.getByLabelText("Auth token"), "the-auth-token");
            await user.type(screen.getByLabelText("Send from"), "+15555550100");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({
                provider: "twilio",
                twilio: { accountSid: SID, token: "the-auth-token" },
                from: "+15555550100",
            });
            expect(onUpdated).toHaveBeenCalledWith(TWILIO_SAVED);
            expect(await screen.findByText("Saved.")).toBeInTheDocument();
            expect(screen.getByLabelText("Auth token")).toHaveValue("");
        });

        it("sends only what changed: not the token when it's blank, and not the parts left alone", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue({ ...TWILIO_SAVED, twilio: { accountSid: OTHER_SID, tokenSet: true } });
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.clear(screen.getByLabelText("Account SID"));
            await user.type(screen.getByLabelText("Account SID"), OTHER_SID);
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "twilio", twilio: { accountSid: OTHER_SID } });
        });

        it("sends only the token when only that was typed", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TWILIO_SAVED);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.type(screen.getByLabelText("Auth token"), "new-token");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "twilio", twilio: { token: "new-token" } });
        });

        it("saves just the sender when only that changed, leaving Twilio's own settings out", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue({ ...TWILIO_SAVED, from: "Acme" });
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.clear(screen.getByLabelText("Send from"));
            await user.type(screen.getByLabelText("Send from"), "Acme");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "twilio", from: "Acme" });
        });

        it("clears the SID or sender when it's emptied", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue({ ...NONE, provider: "twilio", twilio: { tokenSet: true } });
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.clear(screen.getByLabelText("Account SID"));
            await user.clear(screen.getByLabelText("Send from"));
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "twilio", twilio: { accountSid: null }, from: null });
        });
    });

    describe("Telnyx", () => {
        it("shows the saved messaging profile ID and sender, and never the API key: that field starts empty, saying one is saved", () => {
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);

            expect(screen.getByLabelText("Messaging profile ID")).toHaveValue("profile-1");
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
            const key = screen.getByLabelText("API key");
            expect(key).toHaveValue("");
            expect(key).toHaveAttribute("type", "password");
            expect(key).toHaveAttribute("placeholder", "Saved — leave blank to keep it");
            expect(screen.getByText(/Optional\./)).toBeInTheDocument();
        });

        it("has nothing to say in the API key field, and empty boxes, when nothing is set", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");

            expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "");
            expect(screen.getByLabelText("Messaging profile ID")).toHaveValue("");
        });

        it("saves the key, profile and sender with the provider, then clears the key field", async () => {
            const user = userEvent.setup();
            const onUpdated = vi.fn();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={NONE} onUpdated={onUpdated} />);

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.type(screen.getByLabelText("API key"), "KEY0123");
            await user.type(screen.getByLabelText("Messaging profile ID"), "  profile-1  ");
            await user.type(screen.getByLabelText("Send from"), "+15555550100");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({
                provider: "telnyx",
                telnyx: { apiKey: "KEY0123", messagingProfileId: "profile-1" },
                from: "+15555550100",
            });
            expect(onUpdated).toHaveBeenCalledWith(TELNYX_SAVED);
            expect(await screen.findByText("Saved.")).toBeInTheDocument();
            expect(screen.getByLabelText("API key")).toHaveValue("");
            expect(screen.getByLabelText("Provider")).toHaveValue("telnyx");
        });

        it("sends only the API key when only that was typed", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);

            await user.type(screen.getByLabelText("API key"), "new-key");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "telnyx", telnyx: { apiKey: "new-key" } });
        });

        it("sends only the messaging profile when only that changed, and clears it when it's emptied", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);

            await user.type(screen.getByLabelText("Messaging profile ID"), "-b");
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(mockedUpdate).toHaveBeenLastCalledWith({ provider: "telnyx", telnyx: { messagingProfileId: "profile-1-b" } });

            await user.clear(screen.getByLabelText("Messaging profile ID"));
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(mockedUpdate).toHaveBeenLastCalledWith({ provider: "telnyx", telnyx: { messagingProfileId: null } });
        });

        it("saves just the sender when only that changed, leaving Telnyx's own settings out", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);

            await user.type(screen.getByLabelText("Send from"), "1");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "telnyx", from: "+155555501001" });
        });
    });

    describe("saving", () => {
        it("can't be saved until something has changed", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
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

        it("can't be saved until something has changed, for Telnyx too", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

            await user.type(screen.getByLabelText("API key"), "x");
            expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
            await user.clear(screen.getByLabelText("API key"));
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

            await user.type(screen.getByLabelText("Messaging profile ID"), "x");
            expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
        });

        it("can be saved once a different provider is selected, and not once it's back to the saved one", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

            await user.selectOptions(screen.getByLabelText("Provider"), "twilio");
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        });

        it("saves just the provider, with none of its settings, when only the selector changed", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "telnyx" });
            expect(screen.getByLabelText("Provider")).toHaveValue("telnyx");
        });

        it("doesn't count what was typed for a provider that isn't selected", async () => {
            const user = userEvent.setup();
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.type(screen.getByLabelText("API key"), "typed-key");

            // Back on the default provider, whose own fields are untouched.
            await user.selectOptions(screen.getByLabelText("Provider"), "twilio");

            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        });

        it("sends only the selected provider's changes, not what was typed for the other", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Account SID"), SID);
            await user.type(screen.getByLabelText("Auth token"), "twilio-token");

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.type(screen.getByLabelText("API key"), "KEY0123");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ provider: "telnyx", telnyx: { apiKey: "KEY0123" } });
        });

        it("follows the provider the server reports, whichever the admin selected", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue({ ...TWILIO_SAVED, provider: undefined });
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            await user.click(screen.getByRole("button", { name: "Save" }));

            await waitFor(() => expect(screen.getByLabelText("Provider")).toHaveValue("twilio"));
        });

        it("stops saying 'Saved.' when something is changed again", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TWILIO_SAVED);
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Auth token"), "t");
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");

            for (const label of ["Auth token", "Account SID", "Send from"]) {
                await user.type(screen.getByLabelText(label), "x");
                expect(screen.queryByText("Saved."), label).not.toBeInTheDocument();
                await user.click(screen.getByRole("button", { name: "Save" }));
                await screen.findByText("Saved.");
            }

            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
            mockedUpdate.mockResolvedValue(TELNYX_SAVED);
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");

            for (const label of ["API key", "Messaging profile ID"]) {
                await user.type(screen.getByLabelText(label), "x");
                expect(screen.queryByText("Saved."), label).not.toBeInTheDocument();
                await user.click(screen.getByRole("button", { name: "Save" }));
                await screen.findByText("Saved.");
            }
        });

        it("shows the server's reason when the settings are refused, and a generic message otherwise", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockRejectedValueOnce(new ApiRequestError("The account SID must be 'AC' followed by 32 hexadecimal digits.", 400));
            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Account SID"), "nope");

            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(await screen.findByText(/must be 'AC' followed by 32 hexadecimal digits/)).toBeInTheDocument();

            mockedUpdate.mockRejectedValueOnce(new Error("network down"));
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
        });
    });

    describe("removing", () => {
        it("only offers to remove the selected provider's credentials, and only when some are saved", async () => {
            const user = userEvent.setup();
            const { rerender } = render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Remove saved credentials" })).not.toBeInTheDocument();

            rerender(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<SmsCard settings={{ ...NONE, twilio: { tokenSet: true } }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            // Twilio's are saved, but Telnyx's aren't, and Telnyx is what's selected.
            rerender(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
            await user.selectOptions(screen.getByLabelText("Provider"), "telnyx");
            expect(screen.queryByRole("button", { name: "Remove saved credentials" })).not.toBeInTheDocument();
        });

        it("offers it for Telnyx when a key or only a messaging profile is saved", () => {
            const { rerender } = render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<SmsCard settings={{ ...TELNYX_SAVED, telnyx: { apiKeySet: true } }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<SmsCard settings={{ ...TELNYX_SAVED, telnyx: { apiKeySet: false, messagingProfileId: "profile-1" } }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();
        });

        it("asks first, then clears Twilio's SID and token but not the sender or the choice of provider", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            const after: SmsSettings = { ...TWILIO_SAVED, twilio: { tokenSet: false }, configured: false };
            mockedUpdate.mockResolvedValue(after);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Remove the saved Twilio credentials\?.*can't be sent through Twilio/));
            expect(mockedUpdate).toHaveBeenCalledWith({ twilio: { accountSid: null, token: null } });
            expect(onUpdated).toHaveBeenCalledWith(after);
            expect(screen.getByLabelText("Account SID")).toHaveValue("");
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550100");
        });

        it("clears Telnyx's API key and messaging profile, and leaves Twilio's credentials alone", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const after: SmsSettings = { ...TELNYX_SAVED, telnyx: { apiKeySet: false }, configured: false };
            mockedUpdate.mockResolvedValue(after);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Remove the saved Telnyx credentials?"));
            expect(mockedUpdate).toHaveBeenCalledWith({ telnyx: { apiKey: null, messagingProfileId: null } });
            expect(screen.getByLabelText("Messaging profile ID")).toHaveValue("");
        });

        it("keeps the provider that's selected, even when it isn't the one saved", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedUpdate.mockResolvedValue({ ...TELNYX_SAVED, twilio: { tokenSet: false } });
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);
            await user.selectOptions(screen.getByLabelText("Provider"), "twilio");

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(mockedUpdate).toHaveBeenCalledWith({ twilio: { accountSid: null, token: null } });
            await waitFor(() => expect(screen.getByLabelText("Account SID")).toHaveValue(""));
            expect(screen.getByLabelText("Provider")).toHaveValue("twilio");
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(mockedUpdate).not.toHaveBeenCalled();
        });

        it("shows why removing failed", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

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
            const { unmount } = render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
            unmount();

            render(<SmsCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
        });

        it("asks first, saying what's lost, then replaces the saved settings with what the server reports", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(confirm).toHaveBeenCalledWith(
                expect.stringMatching(/Replace the saved text message settings with the ones in this deployment's configuration.*is lost.*cleared/),
            );
            expect(mockedReset).toHaveBeenCalledTimes(1);
            expect(mockedUpdate).not.toHaveBeenCalled();
            expect(onUpdated).toHaveBeenCalledWith(FROM_CONFIG);
            // The provider comes back from the server too.
            expect(screen.getByLabelText("Provider")).toHaveValue("twilio");
            expect(screen.getByLabelText("Account SID")).toHaveValue(SID);
            expect(screen.getByLabelText("Send from")).toHaveValue("+15555550199");
            expect(screen.getByLabelText("Auth token")).toHaveValue("");
        });

        it("clears anything typed but not saved, and a leftover 'Saved.'", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedUpdate.mockResolvedValue(TWILIO_SAVED);
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Auth token"), "typed-secret");
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
            await user.type(screen.getByLabelText("Auth token"), "more");

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            await waitFor(() => expect(screen.getByLabelText("Auth token")).toHaveValue(""));
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("clears a Telnyx API key that was typed but not saved", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedReset.mockResolvedValue(TELNYX_SAVED);
            render(<SmsCard settings={TELNYX_SAVED} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("API key"), "typed-secret");

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(mockedReset).not.toHaveBeenCalled();
        });

        it("shows why it failed, with the server's reason or a generic message", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

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
            let finish: (value: SmsSettings) => void = () => undefined;
            mockedReset.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            render(<SmsCard settings={TWILIO_SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeDisabled();
            finish(FROM_CONFIG);
            await waitFor(() => expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeEnabled());
        });
    });
});
