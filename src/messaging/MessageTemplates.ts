///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import fs from "fs";
import { MessagingUtils, type Template } from "@rapidrest/core";
import type { BaseEntity } from "@rapidrest/service-core";
import type { PublicSiteSettings } from "../routes/BaseSiteSettingsRoute.js";

/** The parts of a template an admin can edit. `enabled` is separate: it's a switch, not content. */
export const CONTENT_FIELDS = ["subject", "text", "html", "sms"] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

/**
 * A template as an admin's edits leave it. `null` and `undefined` both mean "use the default" — SQL hands back
 * `null` for an empty column and Mongo an absent field — while any string (including `""`) is a deliberate value.
 */
export interface MessageTemplateOverride {
    enabled?: boolean | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    sms?: string | null;
}

/** The shape shared by `MessageTemplateSQL`/`MessageTemplateMongo` that the messaging code depends on. */
export interface MessageTemplateEntity extends BaseEntity, MessageTemplateOverride {}

/** A template as configured (see `DEFAULT_MESSAGE_TEMPLATES`), with the note the admin console shows beside it. */
export interface DescribedTemplate extends Template {
    /** A short name for the admin console, e.g. `Sign-in code`; the template's own name (`login-otp`) if absent. */
    title?: string;
    description?: string;
}

/** A variable a template can use, and what it holds — listed in the admin console beside the editor. */
export interface MessageVariable {
    name: string;
    description: string;
}

export const MESSAGE_VARIABLES: MessageVariable[] = [
    { name: "totp", description: "The one-time code the recipient has to enter." },
    { name: "brand.name", description: "The company name or, without one, the site title from the site branding." },
    { name: "brand.companyName", description: "The company name from the site branding, if one is set." },
    { name: "brand.siteTitle", description: "The site title from the site branding, if one is set." },
    {
        name: "brand.logoUrl",
        description:
            "The full web address of the logo from the site branding, if one is set. E-mail clients generally " +
            "won't display an SVG — use a PNG or JPEG logo if it matters.",
    },
    { name: "brand.serverUrl", description: "The public address of this server." },
];

/** The code shown in a preview — obviously not a real one. */
export const SAMPLE_CODE = "123456";

export interface MessageBrand {
    /** The company name, else the site title, else `RapidREST` — the same name the web pages show. */
    name: string;
    companyName?: string;
    siteTitle?: string;
    /** Absolute, so it works in an e-mail (which has no page to resolve a relative address against). */
    logoUrl?: string;
    serverUrl?: string;
}

/** Where `BaseSiteSettingsRoute.getLogo()` serves an uploaded logo from. */
const UPLOADED_LOGO_PATH = "/api/settings/branding/logo";

function absoluteLogoUrl(settings: PublicSiteSettings, serverUrl: string): string | undefined {
    if (settings.logoUploaded) {
        return serverUrl ? `${serverUrl}${UPLOADED_LOGO_PATH}` : undefined;
    }
    const url = settings.logoUrl?.trim();
    if (!url) {
        return undefined;
    }
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    // A server-relative path only means something once it's tied to this server's address.
    return url.startsWith("/") && !url.startsWith("//") && serverUrl ? `${serverUrl}${url}` : undefined;
}

/**
 * The `brand` every template can use, built from the site branding (see `BaseSiteSettingsRoute`) so a message looks
 * like the site it came from without anyone repeating the name or logo in each template. `serverUrl` is this
 * server's public address (`auth:oauth_server:issuer`), used to make an uploaded or relative logo address absolute.
 */
export function buildBrand(settings: PublicSiteSettings | undefined, serverUrl: string): MessageBrand {
    const origin = serverUrl.trim().replace(/\/+$/, "");
    return {
        name: settings?.companyName || settings?.siteTitle || "RapidREST",
        companyName: settings?.companyName,
        siteTitle: settings?.siteTitle,
        logoUrl: settings ? absoluteLogoUrl(settings, origin) : undefined,
        serverUrl: origin || undefined,
    };
}

/** Reads a template body from `path`, or `undefined` when there's no such file — the same leniency `MessagingUtils` has. */
async function readIfPresent(path: string | undefined): Promise<string | undefined> {
    if (!path) {
        return undefined;
    }
    try {
        return await fs.promises.readFile(path, { encoding: "utf-8" });
    } catch {
        return undefined;
    }
}

/**
 * A configured template with its `htmlPath`/`textPath` files read in and the paths dropped, so what's left is
 * plain content that an override can be laid over and compared with. The files are read on every call, which is
 * cheap for a message sent this rarely and means an edited file takes effect without a restart.
 */
export async function resolveTemplate(base: DescribedTemplate): Promise<DescribedTemplate> {
    const resolved: DescribedTemplate = { ...base };
    const html = await readIfPresent(base.htmlPath);
    const text = await readIfPresent(base.textPath);
    if (html !== undefined) resolved.html = html;
    if (text !== undefined) resolved.text = text;
    delete resolved.htmlPath;
    delete resolved.textPath;
    return resolved;
}

/** `base` with every field an admin has set laid over it. `base` is expected to come from `resolveTemplate()`. */
export function mergeTemplate(base: DescribedTemplate, override?: MessageTemplateOverride | null): DescribedTemplate {
    const merged: DescribedTemplate = { ...base };
    if (!override) {
        return merged;
    }
    if (override.enabled != null) {
        merged.enabled = override.enabled;
    }
    for (const field of CONTENT_FIELDS) {
        const value = override[field];
        if (value != null) {
            merged[field] = value;
        }
    }
    return merged;
}

/** What an admin sees and edits for one template. */
export interface MessageTemplateSummary {
    name: string;
    title?: string;
    description?: string;
    /** Whether any part differs from the default. */
    customized: boolean;
    enabled: boolean;
}

export interface MessageTemplateDetail extends MessageTemplateSummary {
    subject?: string;
    text?: string;
    html?: string;
    sms?: string;
    /** What each part is with no edits — the editor compares against it and offers to revert to it. */
    defaults: { enabled: boolean; subject?: string; text?: string; html?: string; sms?: string };
    /** Which parts are currently edited. */
    overridden: { enabled: boolean; subject: boolean; text: boolean; html: boolean; sms: boolean };
    variables: MessageVariable[];
}

export function summarizeTemplate(
    name: string,
    base: DescribedTemplate,
    override?: MessageTemplateOverride | null,
): MessageTemplateSummary {
    const merged = mergeTemplate(base, override);
    return {
        name,
        title: base.title,
        description: base.description,
        customized: isCustomized(override),
        enabled: merged.enabled,
    };
}

export function describeTemplate(
    name: string,
    base: DescribedTemplate,
    override?: MessageTemplateOverride | null,
): MessageTemplateDetail {
    const merged = mergeTemplate(base, override);
    return {
        ...summarizeTemplate(name, base, override),
        subject: merged.subject,
        text: merged.text,
        html: merged.html,
        sms: merged.sms,
        defaults: { enabled: base.enabled, subject: base.subject, text: base.text, html: base.html, sms: base.sms },
        overridden: {
            enabled: override?.enabled != null,
            subject: override?.subject != null,
            text: override?.text != null,
            html: override?.html != null,
            sms: override?.sms != null,
        },
        variables: MESSAGE_VARIABLES,
    };
}

/** Whether `override` sets anything at all. */
export function isCustomized(override?: MessageTemplateOverride | null): boolean {
    return !!override && (override.enabled != null || CONTENT_FIELDS.some((field) => override[field] != null));
}

/** What a template renders to — the parts a real send would hand to the mail/SMS provider. `null` when that channel wouldn't send. */
export interface RenderedMessage {
    subject: string | null;
    text: string | null;
    html: string | null;
    sms: string | null;
}

/**
 * Renders `template` exactly as a real send would, by running it through a real `MessagingUtils` with only its
 * SMTP/Twilio transports swapped for ones that hand back what they were given. That makes it both the preview
 * shown in the admin console and the check an edit has to pass before it's saved: Handlebars compiles lazily, so a
 * mistake in a template otherwise stays hidden until a real send fails — logged and swallowed by the route that
 * asked — and the user simply never receives their code. Throws (with Handlebars' own message) if it doesn't render.
 *
 * `enabled` is ignored so a disabled template can still be previewed.
 */
export async function renderTemplate(
    name: string,
    template: DescribedTemplate,
    vars: Record<string, unknown>,
): Promise<RenderedMessage> {
    const messaging = new MessagingUtils() as any;
    messaging.templates = {
        from: { email: "preview@example.invalid", sms: "+15555550100" },
        [name]: { ...template, enabled: true },
    };
    messaging.smtpConfig = { host: "preview.invalid" };
    messaging._transporter = { sendMail: async (message: unknown) => message };
    messaging.twilio = { messages: { create: async (message: unknown) => message } };

    const email = (await messaging.sendEmail(name, vars, {})) as { subject?: string; text?: string; html?: string } | undefined;
    const sms = (await messaging.sendSMS(name, vars, {})) as { body?: string } | undefined;
    return {
        subject: email?.subject ?? null,
        text: email?.text ?? null,
        html: email?.html ?? null,
        sms: sms?.body ?? null,
    };
}
