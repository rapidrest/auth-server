// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Layout from "../../../apps/admin/_layout.js";

describe("Layout", () => {
    it("renders the document shell with the given children inside the body", () => {
        const html = renderToStaticMarkup(
            <Layout>
                <p>page content</p>
            </Layout>,
        );

        expect(html).toContain("<title>RapidREST: Admin Console</title>");
        expect(html).toContain('charSet="utf-8"');
        expect(html).toContain('href="/favicon.ico"');
        expect(html).toContain('href="/styles/globals.css"');
        expect(html).toContain("<body><p>page content</p></body>");
    });

    // Mirrors apps/www/_layout.test.tsx — see its comment for why: the framework now spreads every
    // merged page prop (including `siteSettings`, from AdminConsoleRoute's fetchProps() override) onto
    // Layout, not just the page component.
    it("renders the configured company name in the title", () => {
        const html = renderToStaticMarkup(
            <Layout siteSettings={{ companyName: "Acme Inc", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain("<title>Acme Inc: Admin Console</title>");
    });

    it("renders the configured icon URL as the favicon, falling back to the logo, then the default", () => {
        const withIcon = renderToStaticMarkup(
            <Layout
                siteSettings={{ iconUrl: "https://example.com/icon.png", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(withIcon).toContain('href="https://example.com/icon.png"');

        const logoOnly = renderToStaticMarkup(
            <Layout
                siteSettings={{ logoUrl: "https://example.com/logo.png", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(logoOnly).toContain('href="https://example.com/logo.png"');

        const neither = renderToStaticMarkup(
            <Layout siteSettings={{ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(neither).toContain('href="/favicon.ico"');
    });

    it("renders a custom stylesheet link when configured, and none when not", () => {
        const withStylesheet = renderToStaticMarkup(
            <Layout
                siteSettings={{
                    stylesheetUrl: "https://example.com/style.css",
                    logoUploaded: false,
                    iconUploaded: false,
                    stylesheetUploaded: false,
                }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(withStylesheet).toContain('rel="stylesheet" href="https://example.com/style.css" id="rr-custom-stylesheet"');

        const without = renderToStaticMarkup(
            <Layout siteSettings={{ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(without).not.toContain("rr-custom-stylesheet");
    });
});
