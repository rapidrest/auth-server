// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/messagingApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/messagingApi.js")>();
    return { ...actual, updateSmtpSettings: vi.fn(), resetSmtpSettings: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { resetSmtpSettings, SmtpSettings, updateSmtpSettings } from "../../../../apps/shared/lib/messagingApi.js";
import SmtpCard from "../../../../apps/shared/components/admin/messages/SmtpCard.js";

const mockedUpdate = vi.mocked(updateSmtpSettings);
const mockedReset = vi.mocked(resetSmtpSettings);

const NONE: SmtpSettings = { secure: false, passwordSet: false, configured: false };
const SAVED: SmtpSettings = {
    host: "smtp.acme.test",
    port: 587,
    secure: false,
    user: "mailer",
    passwordSet: true,
    from: "Acme <no-reply@acme.test>",
    configured: true,
};

/** What the deployment's config says, which a reset brings back — deliberately unlike SAVED. */
const FROM_CONFIG: SmtpSettings = {
    host: "smtp.config.test",
    port: 465,
    secure: true,
    user: "config-user",
    passwordSet: true,
    from: "config@acme.test",
    configured: true,
};

beforeEach(() => {
    mockedUpdate.mockReset();
    mockedReset.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("SmtpCard", () => {
    it("says whether e-mail can be sent, and through which host", () => {
        const { rerender } = render(<SmtpCard settings={NONE} onUpdated={vi.fn()} />);
        expect(screen.getByText(/can't be sent yet: a host and a sender address are both needed/)).toBeInTheDocument();

        rerender(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);
        expect(screen.getByText("E-mail is sent through smtp.acme.test.")).toBeInTheDocument();
    });

    it("explains that config seeded these, and what's saved here takes over", () => {
        render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByText(/set from this deployment.s configuration the first time the server started/)).toBeInTheDocument();
    });

    it("shows every saved setting, and never the password: that field starts empty, saying one is saved", () => {
        render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

        expect(screen.getByLabelText("Host")).toHaveValue("smtp.acme.test");
        expect(screen.getByLabelText("Port")).toHaveValue(587);
        expect(screen.getByRole("switch", { name: /Encrypt the connection from the start/ })).not.toBeChecked();
        expect(screen.getByLabelText("User name")).toHaveValue("mailer");
        expect(screen.getByLabelText("Send from")).toHaveValue("Acme <no-reply@acme.test>");
        const password = screen.getByLabelText("Password");
        expect(password).toHaveValue("");
        expect(password).toHaveAttribute("type", "password");
        expect(password).toHaveAttribute("placeholder", "Saved — leave blank to keep it");
    });

    it("shows a secure connection as switched on, and empty boxes when nothing is set", () => {
        const { unmount } = render(<SmtpCard settings={{ ...SAVED, secure: true }} onUpdated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: /Encrypt the connection from the start/ })).toBeChecked();
        unmount();

        // Rendered fresh: the fields are seeded from `settings` once, and only the card's own saves change them.
        render(<SmtpCard settings={NONE} onUpdated={vi.fn()} />);
        expect(screen.getByLabelText("Host")).toHaveValue("");
        expect(screen.getByLabelText("Port")).toHaveDisplayValue("");
        expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "");
    });

    it("can't be saved until something has changed", async () => {
        const user = userEvent.setup();
        render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);
        const save = screen.getByRole("button", { name: "Save" });
        expect(save).toBeDisabled();

        await user.type(screen.getByLabelText("Host"), "x");
        expect(save).toBeEnabled();
        await user.type(screen.getByLabelText("Host"), "{Backspace}");
        expect(save).toBeDisabled();

        await user.type(screen.getByLabelText("Password"), "x");
        expect(save).toBeEnabled();
        await user.clear(screen.getByLabelText("Password"));
        expect(save).toBeDisabled();

        await user.click(screen.getByRole("switch", { name: /Encrypt the connection from the start/ }));
        expect(save).toBeEnabled();
    });

    it("saves everything that was filled in, converting the port to a number, then clears the password field", async () => {
        const user = userEvent.setup();
        const onUpdated = vi.fn();
        mockedUpdate.mockResolvedValue({ ...SAVED, host: "smtp.new.test", port: 465, secure: true });
        render(<SmtpCard settings={NONE} onUpdated={onUpdated} />);

        await user.type(screen.getByLabelText("Host"), "  smtp.new.test  ");
        await user.type(screen.getByLabelText("Port"), "465");
        await user.click(screen.getByRole("switch", { name: /Encrypt the connection from the start/ }));
        await user.type(screen.getByLabelText("User name"), "mailer");
        await user.type(screen.getByLabelText("Password"), " a pass ");
        await user.type(screen.getByLabelText("Send from"), "no-reply@acme.test");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({
            host: "smtp.new.test",
            port: 465,
            secure: true,
            user: "mailer",
            password: " a pass ",
            from: "no-reply@acme.test",
        });
        expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.new.test" }));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toHaveValue("");
        expect(screen.getByLabelText("Host")).toHaveValue("smtp.new.test");
    });

    it("sends only what changed: not the password when it's blank, and not the parts left alone", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

        await user.clear(screen.getByLabelText("Send from"));
        await user.type(screen.getByLabelText("Send from"), "other@acme.test");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ from: "other@acme.test" });
    });

    it("clears the host, port, user and sender when they're emptied", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ secure: false, passwordSet: true, configured: false });
        render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

        for (const label of ["Host", "Port", "User name", "Send from"]) {
            await user.clear(screen.getByLabelText(label));
        }
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ host: null, port: null, user: null, from: null });
    });

    it("can turn the secure connection off again", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue({ ...SAVED, secure: false });
        render(<SmtpCard settings={{ ...SAVED, secure: true }} onUpdated={vi.fn()} />);

        await user.click(screen.getByRole("switch", { name: /Encrypt the connection from the start/ }));
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdate).toHaveBeenCalledWith({ secure: false });
    });

    it("stops saying 'Saved.' when anything is edited again", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(SAVED);
        render(<SmtpCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Host"), "h");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findByText("Saved.");

        for (const label of ["Host", "Port", "User name", "Password", "Send from"]) {
            fireEvent.change(screen.getByLabelText(label), { target: { value: label === "Port" ? "25" : "x" } });
            expect(screen.queryByText("Saved."), label).not.toBeInTheDocument();
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
        }

        await user.click(screen.getByRole("switch", { name: /Encrypt the connection from the start/ }));
        expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    });

    it("shows the server's reason when the settings are refused, and a generic message otherwise", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockRejectedValueOnce(new ApiRequestError("The host must be a host name or IP address, without a scheme, port or path.", 400));
        render(<SmtpCard settings={NONE} onUpdated={vi.fn()} />);
        await user.type(screen.getByLabelText("Host"), "smtp://nope");

        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText(/host name or IP address/)).toBeInTheDocument();

        mockedUpdate.mockRejectedValueOnce(new Error("network down"));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Could not save these settings.")).toBeInTheDocument();
    });

    describe("removing", () => {
        it("only offers to remove credentials when a user name or password is saved", () => {
            const { rerender } = render(<SmtpCard settings={{ ...NONE, host: "h" }} onUpdated={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Remove saved credentials" })).not.toBeInTheDocument();

            rerender(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();

            rerender(<SmtpCard settings={{ ...NONE, passwordSet: true }} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeInTheDocument();
        });

        it("asks first, then clears the user name and password but not the host or sender", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            const after = { ...SAVED, user: undefined, passwordSet: false };
            mockedUpdate.mockResolvedValue(after);
            render(<SmtpCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(confirm).toHaveBeenCalled();
            expect(mockedUpdate).toHaveBeenCalledWith({ user: null, password: null });
            expect(onUpdated).toHaveBeenCalledWith(after);
            expect(screen.getByLabelText("User name")).toHaveValue("");
            expect(screen.getByLabelText("Host")).toHaveValue("smtp.acme.test");
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Remove saved credentials" }));

            expect(mockedUpdate).not.toHaveBeenCalled();
        });

        it("shows why removing failed", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

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
            const { unmount } = render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
            unmount();

            render(<SmtpCard settings={NONE} onUpdated={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeInTheDocument();
        });

        it("asks first, saying what's lost, then replaces the saved settings with what the server reports", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onUpdated = vi.fn();
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<SmtpCard settings={SAVED} onUpdated={onUpdated} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(confirm).toHaveBeenCalledWith(
                expect.stringMatching(/Replace the saved SMTP settings with the ones in this deployment's configuration.*is lost.*cleared/),
            );
            expect(mockedReset).toHaveBeenCalledTimes(1);
            expect(mockedUpdate).not.toHaveBeenCalled();
            expect(onUpdated).toHaveBeenCalledWith(FROM_CONFIG);
            expect(screen.getByLabelText("Host")).toHaveValue("smtp.config.test");
            expect(screen.getByLabelText("Port")).toHaveValue(465);
            expect(screen.getByRole("switch", { name: /Encrypt the connection from the start/ })).toBeChecked();
            expect(screen.getByLabelText("Send from")).toHaveValue("config@acme.test");
            expect(screen.getByLabelText("Password")).toHaveValue("");
        });

        it("clears anything typed but not saved, and a leftover 'Saved.'", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedUpdate.mockResolvedValue(SAVED);
            mockedReset.mockResolvedValue(FROM_CONFIG);
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);
            await user.type(screen.getByLabelText("Password"), "typed-secret");
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
            await user.type(screen.getByLabelText("Password"), "more");

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            await waitFor(() => expect(screen.getByLabelText("Password")).toHaveValue(""));
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(mockedReset).not.toHaveBeenCalled();
        });

        it("shows why it failed, with the server's reason or a generic message", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

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
            let finish: (value: SmtpSettings) => void = () => undefined;
            mockedReset.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            render(<SmtpCard settings={SAVED} onUpdated={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to configuration" }));

            expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Remove saved credentials" })).toBeDisabled();
            finish(FROM_CONFIG);
            await waitFor(() => expect(screen.getByRole("button", { name: "Reset to configuration" })).toBeEnabled());
        });
    });
});
