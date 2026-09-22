// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MessagePreview from "../../../../apps/shared/components/admin/messages/MessagePreview.js";

const FULL = {
    subject: "Your Acme code",
    text: "Acme: 123456",
    html: "<p>Acme <b>123456</b></p>",
    sms: "Acme: 123456",
    whatsapp: "Acme: your code is 123456",
};

const WHATSAPP_TEMPLATE = 'Template "login_code" (en_US)\n{{1}}: 123456\n{{2}}: Acme';

describe("MessagePreview", () => {
    it("shows the subject, the plain-text version and the text message", () => {
        render(<MessagePreview rendered={FULL} />);

        expect(screen.getByText("Your Acme code")).toBeInTheDocument();
        expect(screen.getByText("Plain-text version")).toBeInTheDocument();
        // The plain-text body and the SMS render identically here, so both are found.
        expect(screen.getAllByText("Acme: 123456")).toHaveLength(2);
        expect(screen.getByText("12 characters")).toBeInTheDocument();
    });

    it("shows the HTML in a fully sandboxed frame, since it's markup someone typed", () => {
        render(<MessagePreview rendered={FULL} />);

        const frame = screen.getByTitle("HTML e-mail preview");
        expect(frame).toHaveAttribute("sandbox", "");
        expect(frame).toHaveAttribute("srcdoc", "<p>Acme <b>123456</b></p>");
    });

    it("leaves out the HTML frame and the plain-text block when the e-mail has neither", () => {
        render(<MessagePreview rendered={{ ...FULL, html: null, text: null }} />);

        expect(screen.queryByTitle("HTML e-mail preview")).not.toBeInTheDocument();
        expect(screen.queryByText("Plain-text version")).not.toBeInTheDocument();
        expect(screen.getByText("Your Acme code")).toBeInTheDocument();
    });

    it("says the e-mail wouldn't be sent when it has no subject", () => {
        render(<MessagePreview rendered={{ ...FULL, subject: null }} />);

        expect(screen.getByText("This e-mail would not be sent: it has no subject.")).toBeInTheDocument();
        expect(screen.queryByTitle("HTML e-mail preview")).not.toBeInTheDocument();
    });

    it("says the text message wouldn't be sent when it's empty", () => {
        render(<MessagePreview rendered={{ ...FULL, sms: null }} />);

        expect(screen.getByText("This text message would not be sent: it is empty.")).toBeInTheDocument();
        expect(screen.queryByText(/characters/)).not.toBeInTheDocument();
    });

    it("shows the free-form WhatsApp message", () => {
        render(<MessagePreview rendered={FULL} />);

        expect(screen.getByText("WhatsApp message")).toBeInTheDocument();
        expect(screen.getByText("Acme: your code is 123456")).toBeInTheDocument();
    });

    it("shows an approved WhatsApp template's name, language and parameters as the server describes them", () => {
        render(<MessagePreview rendered={{ ...FULL, whatsapp: WHATSAPP_TEMPLATE }} />);

        expect(
            screen.getByText((_, element) => element?.tagName === "PRE" && element.textContent === WHATSAPP_TEMPLATE),
        ).toBeInTheDocument();
    });

    it("says the WhatsApp message wouldn't be sent when it's empty", () => {
        render(<MessagePreview rendered={{ ...FULL, whatsapp: null }} />);

        expect(screen.getByText("This WhatsApp message would not be sent: it is empty.")).toBeInTheDocument();
        expect(screen.queryByText("Acme: your code is 123456")).not.toBeInTheDocument();
    });
});
