// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import AuthShell from "../../../apps/shared/components/layout/AuthShell.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AuthShell", () => {
    it("renders the default RapidREST brand when settings haven't resolved yet", () => {
        mockFetch(() => new Promise(() => undefined) as unknown as Response);
        render(<AuthShell brand>content</AuthShell>);
        expect(screen.getByText("RapidREST")).toBeInTheDocument();
        expect(screen.getByAltText("")).toHaveAttribute("src", "/images/logo.svg");
    });

    it("omits the brand block when brand is not set", () => {
        mockFetch(() => new Promise(() => undefined) as unknown as Response);
        render(<AuthShell>content</AuthShell>);
        expect(screen.queryByText("RapidREST")).not.toBeInTheDocument();
    });

    it("widens the container when wide is set", () => {
        mockFetch(() => new Promise(() => undefined) as unknown as Response);
        const { container } = render(<AuthShell wide>content</AuthShell>);
        expect(container.querySelector(".rr-container--wide")).not.toBeNull();
    });

    describe("brand block", () => {
        const RESOLVED = {
            companyName: "Acme Inc",
            logoUrl: "https://example.com/logo.png",
            headerHtml: "<p>Notice</p>",
            footerHtml: "<p>Footer text</p>",
            logoUploaded: false,
            stylesheetUploaded: false,
        };

        it("shows the configured logo alone, naming it for assistive tech, and leaves the title off", async () => {
            mockFetch(() => jsonResponse(200, RESOLVED));
            render(<AuthShell brand>content</AuthShell>);

            const logo = await screen.findByAltText("Acme Inc");
            expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
            // The logo is the brand; a visible title beside it would say the same thing twice.
            expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();
        });

        it("shows the title beside the stock logo when no logo is configured, since the title stands in for it", async () => {
            mockFetch(() =>
                jsonResponse(200, { companyName: "Acme Inc", logoUploaded: false, stylesheetUploaded: false }),
            );
            render(<AuthShell brand>content</AuthShell>);

            expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
            // Decorative here — the title beside it carries the name.
            expect(screen.getByAltText("")).toHaveAttribute("src", "/images/logo.svg");
        });

        it("treats an uploaded logo as configured", async () => {
            mockFetch(() => jsonResponse(200, { ...RESOLVED, logoUrl: undefined, logoUploaded: true }));
            render(<AuthShell brand>content</AuthShell>);

            expect(await screen.findByAltText("Acme Inc")).toHaveAttribute("src", "/api/settings/branding/logo");
            expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();
        });

        it("doesn't also render the custom header, whose logo would duplicate the brand block's", async () => {
            const fetchMock = mockFetch(() => jsonResponse(200, RESOLVED));
            const { container } = render(<AuthShell brand>content</AuthShell>);

            await waitFor(() => expect(fetchMock).toHaveBeenCalled());
            await screen.findByAltText("Acme Inc");
            expect(screen.queryByText("Notice")).not.toBeInTheDocument();
            expect(container.querySelector(".rr-custom-header")).toBeNull();
        });

        it("still renders the custom footer", async () => {
            mockFetch(() => jsonResponse(200, RESOLVED));
            render(<AuthShell brand>content</AuthShell>);

            expect(await screen.findByText("Footer text")).toBeInTheDocument();
        });
    });

    describe("custom header on a page without the brand block", () => {
        const RESOLVED = { headerHtml: "<p>Notice</p>", logoUploaded: false, stylesheetUploaded: false };

        it("renders it once site settings resolve", async () => {
            mockFetch(() => jsonResponse(200, RESOLVED));
            const { container } = render(<AuthShell>content</AuthShell>);

            expect(await screen.findByText("Notice")).toBeInTheDocument();
            expect(container.querySelector(".rr-custom-header")).not.toHaveClass("rr-custom-header--large-logo");
        });

        it("marks the header for a larger logo when asked", async () => {
            mockFetch(() => jsonResponse(200, RESOLVED));
            const { container } = render(<AuthShell largeHeaderLogo>content</AuthShell>);

            await screen.findByText("Notice");
            expect(container.querySelector(".rr-custom-header")).toHaveClass("rr-custom-header--large-logo");
        });
    });

    it("renders neither header nor footer when settings resolve with none configured", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { logoUploaded: false, stylesheetUploaded: false }));
        const { container } = render(<AuthShell brand>content</AuthShell>);

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(container.querySelector(".rr-custom-header")).toBeNull();
        expect(container.querySelector(".rr-custom-footer")).toBeNull();
    });
});
