// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockLocation } from "./testUtils.js";
import { PublicSiteSettings } from "../../apps/shared/lib/siteSettings.js";
import HomePage from "../../apps/www/index.js";

const baseSettings: PublicSiteSettings = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false };

describe("HomePage", () => {
    it("redirects to /account when a userUid is present", () => {
        const location = mockLocation();
        render(<HomePage userUid="u1" />);
        expect(location.replace).toHaveBeenCalledWith("/account");
    });

    it("renders the default brand mark and title when no site settings are supplied", () => {
        mockLocation();
        render(<HomePage />);
        expect(screen.getByText("RapidREST")).toBeInTheDocument();
        expect(document.querySelector("img")).toHaveAttribute("src", "/images/logo.svg");
    });

    it("prefers a configured icon over the logo, and the company name over the default title", () => {
        mockLocation();
        render(
            <HomePage
                siteSettings={{
                    ...baseSettings,
                    companyName: "Acme Inc",
                    iconUrl: "https://example.com/icon.png",
                    logoUrl: "https://example.com/logo.png",
                }}
            />,
        );
        expect(screen.getByText("Acme Inc")).toBeInTheDocument();
        expect(document.querySelector("img")).toHaveAttribute("src", "https://example.com/icon.png");
    });

    it("falls back to the logo when no icon is configured", () => {
        mockLocation();
        render(<HomePage siteSettings={{ ...baseSettings, logoUrl: "https://example.com/logo.png" }} />);
        expect(document.querySelector("img")).toHaveAttribute("src", "https://example.com/logo.png");
    });

    it("redirects to /auth/signin when there is no userUid", () => {
        const location = mockLocation();
        render(<HomePage />);
        expect(location.replace).toHaveBeenCalledWith("/auth/signin");
    });

    it("includes a noscript meta-refresh fallback pointing at the same target", () => {
        // `useEffect`'s redirect never runs during SSR, so the `<noscript>` fallback is what a
        // JS-disabled browser actually uses — rendered here via `renderToStaticMarkup` (what the real
        // SSR path calls) rather than `render()`, since React deliberately omits `<noscript>` children
        // from the live DOM once client-side scripting is active.
        const html = renderToStaticMarkup(<HomePage userUid="u1" />);
        expect(html).toContain("<noscript>");
        expect(html).toContain("0;url=/account");
    });
});
