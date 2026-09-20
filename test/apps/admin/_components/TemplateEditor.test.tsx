// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/messagingApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/messagingApi.js")>();
    return {
        ...actual,
        previewMessageTemplate: vi.fn(),
        updateMessageTemplate: vi.fn(),
        resetMessageTemplate: vi.fn(),
    };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import {
    MessageTemplateDetail,
    previewMessageTemplate,
    resetMessageTemplate,
    updateMessageTemplate,
} from "../../../../apps/shared/lib/messagingApi.js";
import TemplateEditor from "../../../../apps/shared/components/admin/messages/TemplateEditor.js";

const mockedPreview = vi.mocked(previewMessageTemplate);
const mockedUpdate = vi.mocked(updateMessageTemplate);
const mockedReset = vi.mocked(resetMessageTemplate);

const DETAIL: MessageTemplateDetail = {
    name: "login-otp",
    title: "Sign-in code",
    description: "Sent to sign someone in.",
    customized: false,
    enabled: true,
    subject: "Default subject",
    text: "Default text {{totp}}",
    html: "<p>{{totp}}</p>",
    sms: "Default sms {{totp}}",
    defaults: {
        enabled: true,
        subject: "Default subject",
        text: "Default text {{totp}}",
        html: "<p>{{totp}}</p>",
        sms: "Default sms {{totp}}",
    },
    overridden: { enabled: false, subject: false, text: false, html: false, sms: false },
    variables: [
        { name: "totp", description: "The one-time code." },
        { name: "brand.name", description: "The site name." },
    ],
};

const NOTHING_CHANGED = { enabled: null, subject: null, text: null, html: null, sms: null };

/** Sets a field's value directly: `userEvent.type` reads `{` as key syntax, which template text is full of. */
function setValue(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
    mockedPreview.mockReset();
    mockedUpdate.mockReset();
    mockedReset.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("TemplateEditor", () => {
    it("shows the message's title and description, and every part as it's currently sent", () => {
        render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

        expect(screen.getByText("Sign-in code")).toBeInTheDocument();
        expect(screen.getByText("Sent to sign someone in.")).toBeInTheDocument();
        expect(screen.getByLabelText("Subject")).toHaveValue("Default subject");
        expect(screen.getByLabelText("Plain-text body")).toHaveValue("Default text {{totp}}");
        expect(screen.getByLabelText("HTML body")).toHaveValue("<p>{{totp}}</p>");
        expect(screen.getByLabelText("Message")).toHaveValue("Default sms {{totp}}");
        expect(screen.getByRole("switch", { name: /Send this message/ })).toBeChecked();
    });

    it("falls back to the message's name when it has no title or description", () => {
        render(<TemplateEditor template={{ ...DETAIL, title: undefined, description: undefined }} onChanged={vi.fn()} />);

        expect(screen.getByText("login-otp")).toBeInTheDocument();
        expect(screen.queryByText("Sent to sign someone in.")).not.toBeInTheDocument();
    });

    it("lists the variables a message can use, and how to write the brand ones", () => {
        render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

        expect(screen.getByText("The one-time code.", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("The site name.", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("{{{brand.name}}}")).toBeInTheDocument();
    });

    it("shows every part as empty for a message that has none of them, and saving it changes nothing", async () => {
        const user = userEvent.setup();
        mockedUpdate.mockResolvedValue(DETAIL);
        const bare: MessageTemplateDetail = {
            ...DETAIL,
            subject: undefined,
            text: undefined,
            html: undefined,
            sms: undefined,
            defaults: { enabled: true },
        };
        render(<TemplateEditor template={bare} onChanged={vi.fn()} />);

        for (const label of ["Subject", "Plain-text body", "HTML body", "Message"]) {
            expect(screen.getByLabelText(label)).toHaveValue("");
        }
        expect(screen.queryByRole("button", { name: /Revert/ })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(mockedUpdate).toHaveBeenCalledWith("login-otp", NOTHING_CHANGED);
    });

    it("shows a part the message doesn't have as empty", () => {
        render(<TemplateEditor template={{ ...DETAIL, html: undefined, defaults: { ...DETAIL.defaults, html: undefined } }} onChanged={vi.fn()} />);

        expect(screen.getByLabelText("HTML body")).toHaveValue("");
    });

    describe("saving", () => {
        it("sends nothing as changed when nothing was touched, so every part keeps following the default", async () => {
            const user = userEvent.setup();
            const onChanged = vi.fn();
            const saved = { ...DETAIL };
            mockedUpdate.mockResolvedValue(saved);
            render(<TemplateEditor template={DETAIL} onChanged={onChanged} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", NOTHING_CHANGED);
            expect(onChanged).toHaveBeenCalledWith(saved);
            expect(await screen.findByText("Saved.")).toBeInTheDocument();
        });

        it("sends only the parts that differ from the default", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            setValue("Subject", "New subject");
            setValue("Message", "New {{totp}}");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, subject: "New subject", sms: "New {{totp}}" });
        });

        it("sends the plain-text and HTML bodies when they're edited", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            setValue("Plain-text body", "New text");
            setValue("HTML body", "<i>New</i>");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, text: "New text", html: "<i>New</i>" });
        });

        it("sends an emptied part as an empty string, a deliberate edit rather than 'use the default'", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            setValue("HTML body", "");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, html: "" });
        });

        it("doesn't count an untouched empty box as an edit when the default has no such part", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            const noHtml = { ...DETAIL, html: undefined, defaults: { ...DETAIL.defaults, html: undefined } };
            render(<TemplateEditor template={noHtml} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", NOTHING_CHANGED);
        });

        it("sends enabled: false when the message is switched off, and nothing once it's back to the default", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("switch", { name: /Send this message/ }));
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(mockedUpdate).toHaveBeenLastCalledWith("login-otp", { ...NOTHING_CHANGED, enabled: false });

            await user.click(screen.getByRole("switch", { name: /Send this message/ }));
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(mockedUpdate).toHaveBeenLastCalledWith("login-otp", NOTHING_CHANGED);
        });

        it("shows the server's reason when the message is refused", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockRejectedValue(new ApiRequestError("This template can't be rendered: Parse error", 400));
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(await screen.findByText("This template can't be rendered: Parse error")).toBeInTheDocument();
            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("shows a generic message for an unexpected failure", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockRejectedValue(new Error("network down"));
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(await screen.findByText("Could not save this message.")).toBeInTheDocument();
        });

        it("stops saying 'Saved.' as soon as something is edited again", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");

            setValue("Subject", "Something else");

            expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
        });

        it("disables the buttons while a save is in flight", async () => {
            const user = userEvent.setup();
            let finish: (value: MessageTemplateDetail) => void = () => undefined;
            mockedUpdate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
            render(<TemplateEditor template={{ ...DETAIL, customized: true }} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
            finish(DETAIL);
            await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
        });
    });

    describe("reverting a part", () => {
        it("offers to revert only the parts that differ from the default, each on its own", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            expect(screen.queryByRole("button", { name: /Revert/ })).not.toBeInTheDocument();

            setValue("Subject", "Changed");
            setValue("Message", "Changed too");
            expect(screen.getByRole("button", { name: "Revert subject to the default" })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Revert message to the default" })).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Revert plain-text body to the default" })).not.toBeInTheDocument();

            await user.click(screen.getByRole("button", { name: "Revert subject to the default" }));

            expect(screen.getByLabelText("Subject")).toHaveValue("Default subject");
            expect(screen.getByLabelText("Message")).toHaveValue("Changed too");
            expect(screen.queryByRole("button", { name: "Revert subject to the default" })).not.toBeInTheDocument();
        });

        it("reverts to an empty box for a part the default doesn't have", async () => {
            const user = userEvent.setup();
            const noHtml = { ...DETAIL, html: undefined, defaults: { ...DETAIL.defaults, html: undefined } };
            render(<TemplateEditor template={noHtml} onChanged={vi.fn()} />);
            setValue("HTML body", "<b>added</b>");

            await user.click(screen.getByRole("button", { name: "Revert html body to the default" }));

            expect(screen.getByLabelText("HTML body")).toHaveValue("");
        });

        it("saves a reverted part as 'not edited'", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            // The subject is currently edited on the server.
            const edited = { ...DETAIL, customized: true, subject: "Edited", overridden: { ...DETAIL.overridden, subject: true } };
            render(<TemplateEditor template={edited} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Revert subject to the default" }));
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", NOTHING_CHANGED);
        });
    });

    describe("previewing", () => {
        const RENDERED = { subject: "Preview subject", text: "Preview text", html: "<p>Preview</p>", sms: "Preview sms" };

        it("renders the draft, without saving it", async () => {
            const user = userEvent.setup();
            mockedPreview.mockResolvedValue(RENDERED);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            setValue("Subject", "Draft subject");

            await user.click(screen.getByRole("button", { name: "Preview" }));

            expect(mockedPreview).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, subject: "Draft subject" });
            expect(await screen.findByText("Preview subject")).toBeInTheDocument();
            expect(screen.getByTitle("HTML e-mail preview")).toBeInTheDocument();
            expect(mockedUpdate).not.toHaveBeenCalled();
        });

        it("clears the preview once the draft is edited, since it no longer shows what's on screen", async () => {
            const user = userEvent.setup();
            mockedPreview.mockResolvedValue(RENDERED);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Preview" }));
            await screen.findByText("Preview subject");

            setValue("Message", "Different");

            expect(screen.queryByText("Preview subject")).not.toBeInTheDocument();
        });

        it("shows why a draft can't be previewed", async () => {
            const user = userEvent.setup();
            mockedPreview.mockRejectedValue(new ApiRequestError("This template can't be rendered: nope", 400));
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Preview" }));

            expect(await screen.findByText("This template can't be rendered: nope")).toBeInTheDocument();
        });

        it("drops an earlier preview when a later one fails, and shows a generic message for an unexpected failure", async () => {
            const user = userEvent.setup();
            mockedPreview.mockResolvedValueOnce(RENDERED).mockRejectedValueOnce(new Error("network down"));
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Preview" }));
            await screen.findByText("Preview subject");

            await user.click(screen.getByRole("button", { name: "Preview" }));

            expect(await screen.findByText("Could not preview this message.")).toBeInTheDocument();
            expect(screen.queryByText("Preview subject")).not.toBeInTheDocument();
        });
    });

    describe("resetting", () => {
        const CUSTOMIZED = { ...DETAIL, customized: true, subject: "Edited", overridden: { ...DETAIL.overridden, subject: true } };

        it("only offers to reset a message that has been customized", () => {
            const { rerender } = render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            expect(screen.queryByRole("button", { name: "Reset to default" })).not.toBeInTheDocument();

            rerender(<TemplateEditor template={CUSTOMIZED} onChanged={vi.fn()} />);
            expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument();
        });

        it("asks first, then discards every edit", async () => {
            const user = userEvent.setup();
            const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
            const onChanged = vi.fn();
            mockedReset.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={CUSTOMIZED} onChanged={onChanged} />);

            await user.click(screen.getByRole("button", { name: "Reset to default" }));

            expect(confirm).toHaveBeenCalledWith("Discard every edit to this message and go back to the default?");
            expect(mockedReset).toHaveBeenCalledWith("login-otp");
            await waitFor(() => expect(onChanged).toHaveBeenCalledWith(DETAIL));
        });

        it("does nothing when the admin says no", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(false);
            render(<TemplateEditor template={CUSTOMIZED} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to default" }));

            expect(mockedReset).not.toHaveBeenCalled();
        });

        it("clears a preview of the edited version", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedPreview.mockResolvedValue({ subject: "Edited preview", text: null, html: null, sms: null });
            mockedReset.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={CUSTOMIZED} onChanged={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Preview" }));
            await screen.findByText("Edited preview");

            await user.click(screen.getByRole("button", { name: "Reset to default" }));

            await waitFor(() => expect(screen.queryByText("Edited preview")).not.toBeInTheDocument());
        });

        it("shows why a reset failed", async () => {
            const user = userEvent.setup();
            vi.spyOn(window, "confirm").mockReturnValue(true);
            mockedReset.mockRejectedValueOnce(new ApiRequestError("Elevation required.", 403));
            render(<TemplateEditor template={CUSTOMIZED} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Reset to default" }));
            expect(await screen.findByText("Elevation required.")).toBeInTheDocument();

            mockedReset.mockRejectedValueOnce(new Error("network down"));
            await user.click(screen.getByRole("button", { name: "Reset to default" }));
            expect(await screen.findByText("Could not reset this message.")).toBeInTheDocument();
        });
    });

    it("follows the template as the server has it, once it's saved or reset", () => {
        const { rerender } = render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
        setValue("Subject", "Half-typed");

        rerender(<TemplateEditor template={{ ...DETAIL, subject: "As saved", enabled: false }} onChanged={vi.fn()} />);

        expect(screen.getByLabelText("Subject")).toHaveValue("As saved");
        expect(screen.getByRole("switch", { name: /Send this message/ })).not.toBeChecked();
        expect(within(screen.getByLabelText("Subject").closest(".rr-field")!).queryByRole("button")).toBeInTheDocument();
    });
});
