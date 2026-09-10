// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// `Layout` renders a full `<html>` document — it's only ever used server-side to wrap SSR output, never
// mounted client-side into an existing DOM. Rendered here via `renderToStaticMarkup` (the same kind of
// call the SSR renderer itself makes) rather than `@testing-library/react`'s `render()`, which would
// mount it inside a `<div>` and trip React's "`<html>` cannot be a child of `<div>`" nesting warning.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Layout from "../../apps/www/_layout.js";

describe("Layout", () => {
    it("renders the document shell with the given children inside the body", () => {
        const html = renderToStaticMarkup(
            <Layout>
                <p>page content</p>
            </Layout>,
        );

        expect(html).toContain("<title>RapidREST</title>");
        expect(html).toContain('charSet="utf-8"');
        expect(html).toContain('href="/favicon.ico"');
        expect(html).toContain('href="/styles/globals.css"');
        expect(html).toContain("<body><p>page content</p></body>");
    });

    // The framework now spreads every merged page prop onto Layout too (see @rapidrest/react's
    // ReactRoute.tsx) — wwwRoute's fetchProps() override supplies `siteSettings` this way, so Layout
    // renders real branding server-side instead of the client-only useSiteSettings() flash this used to
    // rely on. These cases exercise that prop directly, the same way the real render pipeline does.
    it("renders the configured title, falling back to siteTitle when companyName is unset", () => {
        const html = renderToStaticMarkup(
            <Layout siteSettings={{ siteTitle: "Acme Site", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain("<title>Acme Site</title>");
    });

    it("prefers companyName over siteTitle for the title", () => {
        const html = renderToStaticMarkup(
            <Layout
                siteSettings={{
                    siteTitle: "Acme Site",
                    companyName: "Acme Inc",
                    logoUploaded: false,
                    iconUploaded: false,
                    stylesheetUploaded: false,
                }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain("<title>Acme Inc</title>");
    });

    it("renders the configured icon URL as the favicon when one is set", () => {
        const html = renderToStaticMarkup(
            <Layout
                siteSettings={{ iconUrl: "https://example.com/icon.png", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain('href="https://example.com/icon.png"');
    });

    it("falls back to the logo for the favicon when no icon is configured", () => {
        const html = renderToStaticMarkup(
            <Layout
                siteSettings={{ logoUrl: "https://example.com/logo.png", logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}
            >
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain('href="https://example.com/logo.png"');
    });

    it("falls back to the default favicon when neither icon nor logo is configured", () => {
        const html = renderToStaticMarkup(
            <Layout siteSettings={{ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(html).toContain('href="/favicon.ico"');
    });

    it("renders a custom stylesheet link (with the id useSiteSettings' live refresh matches on) when configured", () => {
        const html = renderToStaticMarkup(
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
        expect(html).toContain('rel="stylesheet" href="https://example.com/style.css" id="rr-custom-stylesheet"');
    });

    it("renders no custom stylesheet link when none is configured", () => {
        const html = renderToStaticMarkup(
            <Layout siteSettings={{ logoUploaded: false, iconUploaded: false, stylesheetUploaded: false }}>
                <p>x</p>
            </Layout>,
        );
        expect(html).not.toContain("rr-custom-stylesheet");
    });
});
