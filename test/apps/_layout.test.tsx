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
});
