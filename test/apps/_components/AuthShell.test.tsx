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

    it("renders custom branding, header, and footer once site settings resolve", async () => {
        mockFetch((url) => {
            if (url === "/api/settings") {
                return jsonResponse(200, {
                    companyName: "Acme Inc",
                    logoUrl: "https://example.com/logo.png",
                    headerHtml: "<p>Notice</p>",
                    footerHtml: "<p>Footer text</p>",
                    logoUploaded: false,
                    stylesheetUploaded: false,
                });
            }
            throw new Error(`unexpected ${url}`);
        });
        render(<AuthShell brand>content</AuthShell>);

        expect(await screen.findByText("Acme Inc")).toBeInTheDocument();
        expect(screen.getByAltText("")).toHaveAttribute("src", "https://example.com/logo.png");
        expect(screen.getByText("Notice")).toBeInTheDocument();
        expect(screen.getByText("Footer text")).toBeInTheDocument();
    });

    it("renders neither header nor footer when settings resolve with none configured", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { logoUploaded: false, stylesheetUploaded: false }));
        const { container } = render(<AuthShell brand>content</AuthShell>);

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(container.querySelector(".rr-custom-header")).toBeNull();
        expect(container.querySelector(".rr-custom-footer")).toBeNull();
    });
});
