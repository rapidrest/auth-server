///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
    buildBrand,
    describeTemplate,
    isCustomized,
    mergeTemplate,
    MESSAGE_VARIABLES,
    renderTemplate,
    resolveTemplate,
    summarizeTemplate,
} from "../src/messaging/MessageTemplates.js";

const BASE = {
    enabled: true,
    title: "Sign-in code",
    description: "Sent to sign in.",
    subject: "Subject",
    text: "Text {{totp}}",
    html: "<p>{{totp}}</p>",
    sms: "Sms {{totp}}",
};

describe("buildBrand", () => {
    const NO_LOGO = { logoUploaded: false, iconUploaded: false, stylesheetUploaded: false };

    it("uses the company name, else the site title, else the stock name", () => {
        expect(buildBrand({ ...NO_LOGO, companyName: "Acme", siteTitle: "Portal" }, "").name).toBe("Acme");
        expect(buildBrand({ ...NO_LOGO, siteTitle: "Portal" }, "").name).toBe("Portal");
        expect(buildBrand({ ...NO_LOGO }, "").name).toBe("RapidREST");
        expect(buildBrand(undefined, "").name).toBe("RapidREST");
    });

    it("carries the company name, site title and server address as given", () => {
        expect(buildBrand({ ...NO_LOGO, companyName: "Acme", siteTitle: "Portal" }, "https://auth.acme.test/")).toMatchObject({
            companyName: "Acme",
            siteTitle: "Portal",
            serverUrl: "https://auth.acme.test",
        });
    });

    it("has no server address when none is configured", () => {
        expect(buildBrand(undefined, "  ").serverUrl).toBeUndefined();
    });

    it("keeps an absolute logo address as it is", () => {
        expect(buildBrand({ ...NO_LOGO, logoUrl: "https://cdn.acme.test/logo.png" }, "").logoUrl).toBe(
            "https://cdn.acme.test/logo.png",
        );
        expect(buildBrand({ ...NO_LOGO, logoUrl: "HTTP://cdn.acme.test/logo.png" }, "").logoUrl).toBe(
            "HTTP://cdn.acme.test/logo.png",
        );
    });

    it("points an uploaded logo at this server, which an e-mail can only do with an absolute address", () => {
        expect(buildBrand({ ...NO_LOGO, logoUploaded: true, logoUrl: "https://ignored.test/x.png" }, "https://auth.acme.test/").logoUrl).toBe(
            "https://auth.acme.test/api/settings/branding/logo",
        );
    });

    it("has no logo for an upload it can't give an address to", () => {
        expect(buildBrand({ ...NO_LOGO, logoUploaded: true }, "").logoUrl).toBeUndefined();
    });

    it("makes a server-relative logo path absolute against this server", () => {
        expect(buildBrand({ ...NO_LOGO, logoUrl: "/images/logo.png" }, "https://auth.acme.test").logoUrl).toBe(
            "https://auth.acme.test/images/logo.png",
        );
    });

    it("has no logo for a relative path it can't resolve, or one that isn't a usable address", () => {
        expect(buildBrand({ ...NO_LOGO, logoUrl: "/images/logo.png" }, "").logoUrl).toBeUndefined();
        expect(buildBrand({ ...NO_LOGO, logoUrl: "//cdn.acme.test/logo.png" }, "https://auth.acme.test").logoUrl).toBeUndefined();
        expect(buildBrand({ ...NO_LOGO, logoUrl: "logo.png" }, "https://auth.acme.test").logoUrl).toBeUndefined();
        expect(buildBrand({ ...NO_LOGO, logoUrl: "javascript:alert(1)" }, "https://auth.acme.test").logoUrl).toBeUndefined();
        expect(buildBrand({ ...NO_LOGO, logoUrl: "   " }, "https://auth.acme.test").logoUrl).toBeUndefined();
    });
});

describe("mergeTemplate", () => {
    it("is the default when there are no edits", () => {
        expect(mergeTemplate(BASE)).toEqual(BASE);
        expect(mergeTemplate(BASE, null)).toEqual(BASE);
        expect(mergeTemplate(BASE, { enabled: null, subject: null, text: undefined, html: null, sms: null })).toEqual(BASE);
    });

    it("lays each edited part over the default and leaves the rest", () => {
        expect(mergeTemplate(BASE, { subject: "New", sms: "New sms" })).toEqual({ ...BASE, subject: "New", sms: "New sms" });
    });

    it("treats an empty string as a deliberate edit, not as 'use the default'", () => {
        expect(mergeTemplate(BASE, { html: "" }).html).toBe("");
    });

    it("applies enabled: false", () => {
        expect(mergeTemplate(BASE, { enabled: false }).enabled).toBe(false);
    });

    it("doesn't change the default it was given", () => {
        mergeTemplate(BASE, { subject: "New" });
        expect(BASE.subject).toBe("Subject");
    });
});

describe("isCustomized", () => {
    it("is true only when something is edited", () => {
        expect(isCustomized(undefined)).toBe(false);
        expect(isCustomized(null)).toBe(false);
        expect(isCustomized({})).toBe(false);
        expect(isCustomized({ enabled: null, subject: null })).toBe(false);
        expect(isCustomized({ enabled: false })).toBe(true);
        expect(isCustomized({ sms: "" })).toBe(true);
    });
});

describe("summarizeTemplate / describeTemplate", () => {
    it("summarizes an unedited template", () => {
        expect(summarizeTemplate("login-otp", BASE)).toEqual({
            name: "login-otp",
            title: "Sign-in code",
            description: "Sent to sign in.",
            customized: false,
            enabled: true,
        });
    });

    it("summarizes an edited one, reflecting whether it's still enabled", () => {
        expect(summarizeTemplate("login-otp", BASE, { enabled: false })).toMatchObject({ customized: true, enabled: false });
    });

    it("describes the effective content beside the defaults and which parts are edited", () => {
        const detail = describeTemplate("login-otp", BASE, { subject: "New", html: "" });

        expect(detail).toMatchObject({ name: "login-otp", customized: true, enabled: true, subject: "New", html: "", text: BASE.text, sms: BASE.sms });
        expect(detail.defaults).toEqual({ enabled: true, subject: "Subject", text: BASE.text, html: BASE.html, sms: BASE.sms });
        expect(detail.overridden).toEqual({ enabled: false, subject: true, text: false, html: true, sms: false });
        expect(detail.variables).toBe(MESSAGE_VARIABLES);
    });

    it("describes an unedited template as fully following the defaults", () => {
        const detail = describeTemplate("login-otp", BASE);

        expect(detail.customized).toBe(false);
        expect(detail.overridden).toEqual({ enabled: false, subject: false, text: false, html: false, sms: false });
        expect(detail.subject).toBe("Subject");
    });
});

describe("resolveTemplate", () => {
    const files: string[] = [];
    function tempFile(content: string): string {
        const file = path.join(os.tmpdir(), `rr-template-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
        fs.writeFileSync(file, content);
        files.push(file);
        return file;
    }
    afterEach(() => {
        for (const file of files.splice(0)) fs.rmSync(file, { force: true });
    });

    it("reads the html and text files in and drops the paths, so what's left is plain content", async () => {
        const resolved = await resolveTemplate({
            ...BASE,
            htmlPath: tempFile("<b>from file</b>"),
            textPath: tempFile("text from file"),
        });

        expect(resolved.html).toBe("<b>from file</b>");
        expect(resolved.text).toBe("text from file");
        expect(resolved.htmlPath).toBeUndefined();
        expect(resolved.textPath).toBeUndefined();
    });

    it("keeps the configured content when the file isn't there, as MessagingUtils does", async () => {
        const resolved = await resolveTemplate({ ...BASE, htmlPath: "/no/such/file.html", textPath: "/no/such/file.txt" });

        expect(resolved.html).toBe(BASE.html);
        expect(resolved.text).toBe(BASE.text);
        expect(resolved.htmlPath).toBeUndefined();
    });

    it("leaves a template with no paths as it is", async () => {
        expect(await resolveTemplate(BASE)).toEqual(BASE);
    });
});

describe("renderTemplate", () => {
    const VARS = { totp: "482913", brand: { name: "Tom & Jerry", logoUrl: undefined } };

    it("renders every part the way a real send would", async () => {
        const rendered = await renderTemplate("t", { enabled: true, subject: "Hi {{{brand.name}}}", text: "{{{brand.name}}}: {{totp}}", html: "<p>{{brand.name}} {{totp}}</p>", sms: "{{totp}}" }, VARS);

        expect(rendered).toEqual({
            subject: "Hi Tom & Jerry",
            text: "Tom & Jerry: 482913",
            html: "<p>Tom &amp; Jerry 482913</p>",
            sms: "482913",
        });
    });

    it("gives null for a channel that wouldn't send", async () => {
        const rendered = await renderTemplate("t", { enabled: true, subject: "", sms: "" }, VARS);

        expect(rendered).toEqual({ subject: null, text: null, html: null, sms: null });
    });

    it("renders a disabled template too, so it can still be previewed", async () => {
        const rendered = await renderTemplate("t", { enabled: false, subject: "S", sms: "{{totp}}" }, VARS);

        expect(rendered.subject).toBe("S");
        expect(rendered.sms).toBe("482913");
    });

    it("rejects a template that doesn't render, which a real send would only have failed at silently", async () => {
        await expect(renderTemplate("t", { enabled: true, subject: "S", text: "{{#if totp}}unclosed" }, VARS)).rejects.toThrow();
        await expect(renderTemplate("t", { enabled: true, sms: "{{totp" }, VARS)).rejects.toThrow();
    });
});
