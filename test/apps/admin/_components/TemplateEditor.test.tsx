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
    whatsapp: "Default whatsapp {{totp}}",
    defaults: {
        enabled: true,
        subject: "Default subject",
        text: "Default text {{totp}}",
        html: "<p>{{totp}}</p>",
        sms: "Default sms {{totp}}",
        whatsapp: "Default whatsapp {{totp}}",
    },
    overridden: {
        enabled: false,
        subject: false,
        text: false,
        html: false,
        sms: false,
        whatsapp: false,
        whatsappTemplateName: false,
        whatsappTemplateLanguage: false,
        whatsappTemplateParameters: false,
    },
    variables: [
        { name: "totp", description: "The one-time code." },
        { name: "brand.name", description: "The site name." },
    ],
};

const NOTHING_CHANGED = {
    enabled: null,
    subject: null,
    text: null,
    html: null,
    sms: null,
    whatsapp: null,
    whatsappTemplateName: null,
    whatsappTemplateLanguage: null,
    whatsappTemplateParameters: null,
};

/** A message whose default is an approved WhatsApp template rather than only free-form text. */
const TEMPLATED: MessageTemplateDetail = {
    ...DETAIL,
    whatsappTemplateName: "login_code",
    whatsappTemplateLanguage: "en_US",
    whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
    defaults: {
        ...DETAIL.defaults,
        whatsappTemplateName: "login_code",
        whatsappTemplateLanguage: "en_US",
        whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
    },
};

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
            whatsapp: undefined,
            defaults: { enabled: true },
        };
        render(<TemplateEditor template={bare} onChanged={vi.fn()} />);

        for (const label of [
            "Subject",
            "Plain-text body",
            "HTML body",
            "Message",
            "WhatsApp message",
            "Template name",
            "Language code",
            "Parameters",
        ]) {
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

    describe("WhatsApp", () => {
        it("shows the free-form message, and the approved template as three fields, as they're currently sent", () => {
            render(<TemplateEditor template={TEMPLATED} onChanged={vi.fn()} />);

            expect(screen.getByLabelText("WhatsApp message")).toHaveValue("Default whatsapp {{totp}}");
            expect(screen.getByLabelText("Template name")).toHaveValue("login_code");
            expect(screen.getByLabelText("Language code")).toHaveValue("en_US");
            expect(screen.getByLabelText("Parameters")).toHaveValue("{{totp}}\n{{{brand.name}}}");
        });

        it("groups the approved template's fields under their own heading, with placeholders", () => {
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            const group = screen.getByRole("group", { name: "Approved WhatsApp template" });
            expect(within(group).getByLabelText("Template name")).toHaveAttribute("placeholder", "login_code");
            expect(within(group).getByLabelText("Language code")).toHaveAttribute("placeholder", "en_US");
            expect(within(group).getByLabelText("Parameters")).toHaveAttribute("placeholder", "{{totp}}");
            expect(within(group).queryByLabelText("WhatsApp message")).not.toBeInTheDocument();
        });

        it("explains the 24-hour rule, what an approved template is, and how to fill its parameters", () => {
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            expect(screen.getByText(/only delivers it to someone who has messaged you in the last 24 hours/)).toBeInTheDocument();
            expect(screen.getByText(/approved in Meta.s WhatsApp Manager can be sent to anyone/)).toBeInTheDocument();
            expect(screen.getByText(/Leave the name empty\s+to send that message/)).toBeInTheDocument();
            expect(screen.getByText(/The language it was approved in, like en_US/)).toBeInTheDocument();
            expect(screen.getByText(/One per line, filling the template's/)).toBeInTheDocument();
        });

        it("sends only the free-form message when only that was edited", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);

            setValue("WhatsApp message", "New {{totp}}");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, whatsapp: "New {{totp}}" });
        });

        it("sends the template's name, language and parameters when they're filled in, and nothing for an untouched empty one", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            await user.click(screen.getByRole("button", { name: "Save" }));
            expect(mockedUpdate).toHaveBeenLastCalledWith("login-otp", NOTHING_CHANGED);

            setValue("Template name", "login_code");
            setValue("Language code", "en_US");
            setValue("Parameters", "{{totp}}\n{{{brand.name}}}");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenLastCalledWith("login-otp", {
                ...NOTHING_CHANGED,
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            });
        });

        it("sends nothing as changed for a template that follows its default", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(TEMPLATED);
            render(<TemplateEditor template={TEMPLATED} onChanged={vi.fn()} />);

            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", NOTHING_CHANGED);
        });

        it("sends an emptied template name as an empty string, which is how to go back to the free-form message", async () => {
            const user = userEvent.setup();
            mockedUpdate.mockResolvedValue(DETAIL);
            render(<TemplateEditor template={TEMPLATED} onChanged={vi.fn()} />);

            setValue("Template name", "");
            await user.click(screen.getByRole("button", { name: "Save" }));

            expect(mockedUpdate).toHaveBeenCalledWith("login-otp", { ...NOTHING_CHANGED, whatsappTemplateName: "" });
        });

        it("offers to revert each edited part on its own, to the default or to an empty box", async () => {
            const user = userEvent.setup();
            render(<TemplateEditor template={TEMPLATED} onChanged={vi.fn()} />);
            expect(screen.queryByRole("button", { name: /Revert/ })).not.toBeInTheDocument();

            setValue("WhatsApp message", "Changed");
            setValue("Template name", "other");
            setValue("Language code", "fr");
            setValue("Parameters", "{{x}}");
            for (const name of [
                "Revert whatsapp message to the default",
                "Revert template name to the default",
                "Revert language code to the default",
                "Revert parameters to the default",
            ]) {
                expect(screen.getByRole("button", { name })).toBeInTheDocument();
            }

            await user.click(screen.getByRole("button", { name: "Revert template name to the default" }));
            await user.click(screen.getByRole("button", { name: "Revert language code to the default" }));
            await user.click(screen.getByRole("button", { name: "Revert parameters to the default" }));
            await user.click(screen.getByRole("button", { name: "Revert whatsapp message to the default" }));

            expect(screen.getByLabelText("Template name")).toHaveValue("login_code");
            expect(screen.getByLabelText("Language code")).toHaveValue("en_US");
            expect(screen.getByLabelText("Parameters")).toHaveValue("{{totp}}\n{{{brand.name}}}");
            expect(screen.getByLabelText("WhatsApp message")).toHaveValue("Default whatsapp {{totp}}");
            expect(screen.queryByRole("button", { name: /Revert/ })).not.toBeInTheDocument();
        });

        it("reverts to an empty box for a part the default doesn't have", async () => {
            const user = userEvent.setup();
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            setValue("Template name", "added");

            await user.click(screen.getByRole("button", { name: "Revert template name to the default" }));

            expect(screen.getByLabelText("Template name")).toHaveValue("");
        });

        it("previews the draft with the WhatsApp parts, and shows the rendered template", async () => {
            const user = userEvent.setup();
            mockedPreview.mockResolvedValue({
                subject: null,
                text: null,
                html: null,
                sms: null,
                whatsapp: 'Template "login_code" (en_US)\n{{1}}: 123456',
            });
            render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            setValue("Template name", "login_code");
            setValue("Language code", "en_US");
            setValue("Parameters", "{{totp}}");

            await user.click(screen.getByRole("button", { name: "Preview" }));

            expect(mockedPreview).toHaveBeenCalledWith("login-otp", {
                ...NOTHING_CHANGED,
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}",
            });
            expect(await screen.findByText(/Template "login_code" \(en_US\)/)).toBeInTheDocument();
        });

        it("follows the WhatsApp parts as the server has them, once it's saved or reset", () => {
            const { rerender } = render(<TemplateEditor template={DETAIL} onChanged={vi.fn()} />);
            setValue("Template name", "half-typed");

            rerender(<TemplateEditor template={TEMPLATED} onChanged={vi.fn()} />);

            expect(screen.getByLabelText("Template name")).toHaveValue("login_code");
        });
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
        const RENDERED = { subject: "Preview subject", text: "Preview text", html: "<p>Preview</p>", sms: "Preview sms", whatsapp: "Preview whatsapp" };

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
            mockedPreview.mockResolvedValue({ subject: "Edited preview", text: null, html: null, sms: null, whatsapp: null });
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
