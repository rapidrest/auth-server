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
    CONTENT_FIELDS,
    contentOf,
    describeTemplate,
    isCustomized,
    mergeTemplate,
    MESSAGE_VARIABLES,
    renderTemplate,
    resolveTemplate,
    summarizeTemplate,
    type DescribedTemplate,
} from "../src/messaging/MessageTemplates.js";

const BASE = {
    enabled: true,
    title: "Sign-in code",
    description: "Sent to sign in.",
    subject: "Subject",
    text: "Text {{totp}}",
    html: "<p>{{totp}}</p>",
    sms: "Sms {{totp}}",
    whatsapp: "WhatsApp {{totp}}",
};

/** `BASE` as a deployment that has an approved WhatsApp message template set up would have it. */
const WITH_WHATSAPP_TEMPLATE: DescribedTemplate = {
    ...BASE,
    whatsapp_template: { name: "login_code", language: "en_US", parameters: ["{{totp}}", "{{{brand.name}}}"] },
};

/** What `describeTemplate()` reports for the parts that aren't edited, with everything else false. */
const NOTHING_OVERRIDDEN = {
    enabled: false,
    subject: false,
    text: false,
    html: false,
    sms: false,
    whatsapp: false,
    whatsappTemplateName: false,
    whatsappTemplateLanguage: false,
    whatsappTemplateParameters: false,
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

    it("lays an edited free-form WhatsApp message over the default, and treats an empty one as deliberate", () => {
        expect(mergeTemplate(BASE, { whatsapp: "New {{totp}}" })).toEqual({ ...BASE, whatsapp: "New {{totp}}" });
        expect(mergeTemplate(BASE, { whatsapp: "" }).whatsapp).toBe("");
    });

    it("has no WhatsApp message template unless the default or an edit sets one", () => {
        expect(mergeTemplate(BASE).whatsapp_template).toBeUndefined();
        // Just a language or parameters doesn't make one: there's no name.
        expect(mergeTemplate(BASE, { whatsappTemplateLanguage: "en_US" })).toEqual(BASE);
        expect(mergeTemplate(BASE, { whatsappTemplateParameters: "{{totp}}" })).toEqual(BASE);
        expect(mergeTemplate(BASE, { whatsappTemplateName: "" })).toEqual(BASE);
    });

    it("puts the flattened WhatsApp template fields back together, one parameter per line", () => {
        const merged = mergeTemplate(BASE, {
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_US",
            whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
        });

        expect(merged.whatsapp_template).toEqual({ name: "login_code", language: "en_US", parameters: ["{{totp}}", "{{{brand.name}}}"] });
        // The free-form message is still there: core sends the template in preference to it.
        expect(merged.whatsapp).toBe(BASE.whatsapp);
    });

    it("reads parameters line by line: trimmed, with Windows line breaks and blank lines dropped", () => {
        const merged = mergeTemplate(BASE, {
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_US",
            whatsappTemplateParameters: "  {{totp}}  \r\n\r\n\n   \n{{{brand.name}}}\r\n",
        });

        expect(merged.whatsapp_template?.parameters).toEqual(["{{totp}}", "{{{brand.name}}}"]);
    });

    it("has a WhatsApp template with no parameters for a name and language alone, or for blank parameters", () => {
        expect(mergeTemplate(BASE, { whatsappTemplateName: "hello", whatsappTemplateLanguage: "en" }).whatsapp_template).toEqual({
            name: "hello",
            language: "en",
            parameters: [],
        });
        expect(
            mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateParameters: "  \n " }).whatsapp_template,
        ).toEqual({ name: "login_code", language: "en_US", parameters: [] });
    });

    it("keeps the language empty when a name is edited in with none, for renderTemplate() to refuse", () => {
        expect(mergeTemplate(BASE, { whatsappTemplateName: "login_code" }).whatsapp_template).toEqual({
            name: "login_code",
            language: "",
            parameters: [],
        });
    });

    it("edits one part of the default's WhatsApp template and keeps the rest of it", () => {
        expect(mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateName: "renamed" }).whatsapp_template).toEqual({
            name: "renamed",
            language: "en_US",
            parameters: ["{{totp}}", "{{{brand.name}}}"],
        });
        expect(mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateLanguage: "en_GB" }).whatsapp_template).toEqual({
            name: "login_code",
            language: "en_GB",
            parameters: ["{{totp}}", "{{{brand.name}}}"],
        });
        expect(mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateParameters: "{{totp}}" }).whatsapp_template).toEqual({
            name: "login_code",
            language: "en_US",
            parameters: ["{{totp}}"],
        });
    });

    it("goes back to the free-form message when the template's name is edited to empty, whatever else is set", () => {
        const merged = mergeTemplate(WITH_WHATSAPP_TEMPLATE, {
            whatsappTemplateName: "",
            whatsappTemplateLanguage: "en_GB",
            whatsappTemplateParameters: "{{totp}}",
        });

        expect(merged.whatsapp_template).toBeUndefined();
        expect(merged).not.toHaveProperty("whatsapp_template");
        expect(merged.whatsapp).toBe(BASE.whatsapp);
    });

    it("leaves the default's WhatsApp template alone when none of its parts are edited", () => {
        expect(mergeTemplate(WITH_WHATSAPP_TEMPLATE, { subject: "New" }).whatsapp_template).toEqual(WITH_WHATSAPP_TEMPLATE.whatsapp_template);
        expect(
            mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateName: null, whatsappTemplateLanguage: null, whatsappTemplateParameters: null })
                .whatsapp_template,
        ).toEqual(WITH_WHATSAPP_TEMPLATE.whatsapp_template);
    });

    it("doesn't change the default's WhatsApp template, or share its parameters with the result", () => {
        const before = structuredClone(WITH_WHATSAPP_TEMPLATE.whatsapp_template);

        const merged = mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateLanguage: "en_GB", whatsappTemplateParameters: "x" });
        mergeTemplate(WITH_WHATSAPP_TEMPLATE, { whatsappTemplateName: "" });

        expect(WITH_WHATSAPP_TEMPLATE.whatsapp_template).toEqual(before);
        expect(merged.whatsapp_template?.parameters).not.toBe(WITH_WHATSAPP_TEMPLATE.whatsapp_template?.parameters);
    });
});

describe("contentOf", () => {
    it("reads every part an admin can edit, with the WhatsApp template flattened to text", () => {
        expect(contentOf(WITH_WHATSAPP_TEMPLATE)).toEqual({
            subject: "Subject",
            text: BASE.text,
            html: BASE.html,
            sms: BASE.sms,
            whatsapp: BASE.whatsapp,
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_US",
            whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
        });
    });

    it("has nothing for the WhatsApp template parts when there isn't one", () => {
        const content = contentOf(BASE);

        expect(content.whatsapp).toBe(BASE.whatsapp);
        expect(content.whatsappTemplateName).toBeUndefined();
        expect(content.whatsappTemplateLanguage).toBeUndefined();
        expect(content.whatsappTemplateParameters).toBeUndefined();
    });

    it("has no parameters text for a template that takes none, however the list is empty", () => {
        expect(contentOf({ enabled: true, whatsapp_template: { name: "hello", language: "en" } }).whatsappTemplateParameters).toBeUndefined();
        expect(contentOf({ enabled: true, whatsapp_template: { name: "hello", language: "en", parameters: [] } }).whatsappTemplateParameters).toBeUndefined();
        expect(contentOf({ enabled: true, whatsapp_template: { name: "hello", language: "en", parameters: [] } }).whatsappTemplateName).toBe("hello");
    });

    it("has a key for exactly the parts that can be edited", () => {
        expect(Object.keys(contentOf(BASE)).sort()).toEqual([...CONTENT_FIELDS].sort());
        expect([...CONTENT_FIELDS]).toEqual([
            "subject",
            "text",
            "html",
            "sms",
            "whatsapp",
            "whatsappTemplateName",
            "whatsappTemplateLanguage",
            "whatsappTemplateParameters",
        ]);
    });

    it("reads back as an edit that changes nothing: merging a template's own content over it gives the same template", () => {
        expect(mergeTemplate(WITH_WHATSAPP_TEMPLATE, contentOf(WITH_WHATSAPP_TEMPLATE))).toEqual(WITH_WHATSAPP_TEMPLATE);
        expect(mergeTemplate(BASE, contentOf(BASE))).toEqual(BASE);
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

    it("counts every WhatsApp part, including an empty template name, which is an edit (back to free-form)", () => {
        for (const field of ["whatsapp", "whatsappTemplateName", "whatsappTemplateLanguage", "whatsappTemplateParameters"] as const) {
            expect(isCustomized({ [field]: "x" }), field).toBe(true);
            expect(isCustomized({ [field]: "" }), field).toBe(true);
            expect(isCustomized({ [field]: null }), field).toBe(false);
        }
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
        expect(detail.defaults).toEqual({
            enabled: true,
            subject: "Subject",
            text: BASE.text,
            html: BASE.html,
            sms: BASE.sms,
            whatsapp: BASE.whatsapp,
        });
        expect(detail.overridden).toEqual({ ...NOTHING_OVERRIDDEN, subject: true, html: true });
        expect(detail.variables).toBe(MESSAGE_VARIABLES);
    });

    it("describes an unedited template as fully following the defaults", () => {
        const detail = describeTemplate("login-otp", BASE);

        expect(detail.customized).toBe(false);
        expect(detail.overridden).toEqual(NOTHING_OVERRIDDEN);
        expect(detail.subject).toBe("Subject");
        expect(detail.whatsapp).toBe(BASE.whatsapp);
        expect(detail.whatsappTemplateName).toBeUndefined();
    });

    it("describes a template's WhatsApp message template as the flattened parts an admin edits, in the defaults too", () => {
        const detail = describeTemplate("login-otp", WITH_WHATSAPP_TEMPLATE);

        expect(detail).toMatchObject({
            whatsapp: BASE.whatsapp,
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_US",
            whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
        });
        expect(detail.defaults).toMatchObject({
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_US",
            whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
        });
        expect(detail.overridden).toEqual(NOTHING_OVERRIDDEN);
    });

    it("describes edited WhatsApp parts beside the defaults they came from, and marks only those as edited", () => {
        const detail = describeTemplate("login-otp", WITH_WHATSAPP_TEMPLATE, {
            whatsapp: "Edited {{totp}}",
            whatsappTemplateLanguage: "en_GB",
        });

        expect(detail).toMatchObject({
            customized: true,
            whatsapp: "Edited {{totp}}",
            whatsappTemplateName: "login_code",
            whatsappTemplateLanguage: "en_GB",
            whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
        });
        expect(detail.defaults).toMatchObject({ whatsapp: BASE.whatsapp, whatsappTemplateLanguage: "en_US" });
        expect(detail.overridden).toEqual({ ...NOTHING_OVERRIDDEN, whatsapp: true, whatsappTemplateLanguage: true });
    });

    it("describes an edited-away WhatsApp template (empty name) as free-form, with the name marked edited", () => {
        const detail = describeTemplate("login-otp", WITH_WHATSAPP_TEMPLATE, { whatsappTemplateName: "" });

        expect(detail.whatsappTemplateName).toBeUndefined();
        expect(detail.whatsappTemplateLanguage).toBeUndefined();
        expect(detail.whatsappTemplateParameters).toBeUndefined();
        expect(detail.defaults.whatsappTemplateName).toBe("login_code");
        expect(detail.overridden).toEqual({ ...NOTHING_OVERRIDDEN, whatsappTemplateName: true });
        expect(detail.customized).toBe(true);
    });

    it("summarizes a template as customized when only a WhatsApp part is edited", () => {
        expect(summarizeTemplate("login-otp", BASE, { whatsappTemplateName: "login_code" })).toMatchObject({ customized: true, enabled: true });
        expect(summarizeTemplate("login-otp", BASE, { whatsapp: null })).toMatchObject({ customized: false });
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
        const rendered = await renderTemplate(
            "t",
            {
                enabled: true,
                subject: "Hi {{{brand.name}}}",
                text: "{{{brand.name}}}: {{totp}}",
                html: "<p>{{brand.name}} {{totp}}</p>",
                sms: "{{totp}}",
                whatsapp: "{{{brand.name}}}: {{totp}}",
            },
            VARS,
        );

        expect(rendered).toEqual({
            subject: "Hi Tom & Jerry",
            text: "Tom & Jerry: 482913",
            html: "<p>Tom &amp; Jerry 482913</p>",
            sms: "482913",
            whatsapp: "Tom & Jerry: 482913",
        });
    });

    it("gives null for a channel that wouldn't send", async () => {
        const rendered = await renderTemplate("t", { enabled: true, subject: "", sms: "" }, VARS);

        expect(rendered).toEqual({ subject: null, text: null, html: null, sms: null, whatsapp: null });
    });

    it("gives null for WhatsApp when the free-form message is emptied and there's no message template", async () => {
        const rendered = await renderTemplate("t", { enabled: true, sms: "{{totp}}", whatsapp: "" }, VARS);

        expect(rendered.whatsapp).toBeNull();
        expect(rendered.sms).toBe("482913");
    });

    it("renders a disabled template too, so it can still be previewed", async () => {
        const rendered = await renderTemplate("t", { enabled: false, subject: "S", sms: "{{totp}}", whatsapp: "W {{totp}}" }, VARS);

        expect(rendered.subject).toBe("S");
        expect(rendered.sms).toBe("482913");
        expect(rendered.whatsapp).toBe("W 482913");
    });

    it("renders an approved WhatsApp message template as its name and language, with each parameter filled in", async () => {
        const rendered = await renderTemplate(
            "t",
            { enabled: true, whatsapp_template: { name: "login_code", language: "en_US", parameters: ["{{totp}}", "{{{brand.name}}}"] } },
            VARS,
        );

        expect(rendered.whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 482913\n{{2}}: Tom & Jerry');
    });

    it("renders an approved WhatsApp message template that takes no parameters as just its name and language", async () => {
        for (const parameters of [undefined, []]) {
            const rendered = await renderTemplate("t", { enabled: true, whatsapp_template: { name: "hello_world", language: "en", parameters } }, VARS);

            expect(rendered.whatsapp, JSON.stringify(parameters)).toBe('Template "hello_world" (en)');
        }
    });

    it("previews the message template rather than the free-form text when a template has both, as a real send would send", async () => {
        const rendered = await renderTemplate(
            "t",
            { enabled: true, whatsapp: "free {{totp}}", whatsapp_template: { name: "login_code", language: "en_US", parameters: ["{{totp}}"] } },
            VARS,
        );

        expect(rendered.whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 482913');
        expect(rendered.whatsapp).not.toContain("free");
    });

    it("renders a message template even when there's no free-form text, and a disabled one too", async () => {
        const rendered = await renderTemplate(
            "t",
            { enabled: false, whatsapp_template: { name: "login_code", language: "en_US", parameters: ["{{totp}}"] } },
            VARS,
        );

        expect(rendered.whatsapp).toBe('Template "login_code" (en_US)\n{{1}}: 482913');
    });

    it("refuses a WhatsApp message template with no language, since WhatsApp can't send one", async () => {
        await expect(
            renderTemplate("t", { enabled: true, whatsapp_template: { name: "login_code", language: "", parameters: ["{{totp}}"] } }, VARS),
        ).rejects.toThrow("A WhatsApp template needs the language it was approved in, like en_US.");
        // Merged from an edit that gave a name but no language.
        await expect(renderTemplate("t", mergeTemplate(BASE, { whatsappTemplateName: "login_code" }), VARS)).rejects.toThrow(
            "needs the language",
        );
    });

    it("renders what an edit produces, end to end through mergeTemplate", async () => {
        const rendered = await renderTemplate(
            "t",
            mergeTemplate(BASE, {
                whatsappTemplateName: "login_code",
                whatsappTemplateLanguage: "en_US",
                whatsappTemplateParameters: "{{totp}}\n{{{brand.name}}}",
            }),
            VARS,
        );

        expect(rendered).toMatchObject({
            sms: "Sms 482913",
            whatsapp: 'Template "login_code" (en_US)\n{{1}}: 482913\n{{2}}: Tom & Jerry',
        });
    });

    it("rejects a template that doesn't render, which a real send would only have failed at silently", async () => {
        await expect(renderTemplate("t", { enabled: true, subject: "S", text: "{{#if totp}}unclosed" }, VARS)).rejects.toThrow();
        await expect(renderTemplate("t", { enabled: true, sms: "{{totp" }, VARS)).rejects.toThrow();
    });

    it("rejects a WhatsApp message or parameter that doesn't render, too", async () => {
        await expect(renderTemplate("t", { enabled: true, whatsapp: "{{totp" }, VARS)).rejects.toThrow();
        await expect(
            renderTemplate("t", { enabled: true, whatsapp_template: { name: "n", language: "en", parameters: ["{{#if totp}}unclosed"] } }, VARS),
        ).rejects.toThrow();
    });

    it("never sends anything for real: no transport of the real MessagingUtils is reached", async () => {
        // A request that reached the network would fail for want of a token this preview doesn't have.
        await expect(
            renderTemplate("t", { enabled: true, subject: "S", sms: "s", whatsapp: "w", whatsapp_template: { name: "n", language: "en" } }, VARS),
        ).resolves.toMatchObject({ subject: "S", sms: "s", whatsapp: 'Template "n" (en)' });
    });
});
