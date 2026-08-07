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
});
