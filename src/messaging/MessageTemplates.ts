///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import fs from "fs";
import { MessagingUtils, type Template } from "@rapidrest/core";
import type { BaseEntity } from "@rapidrest/service-core";
import type { PublicSiteSettings } from "../routes/BaseSiteSettingsRoute.js";

/** The parts of a template that are text `MessagingUtils` renders as they are: the same name in `Template` and in an edit. */
const TEMPLATE_TEXT_FIELDS = ["subject", "text", "html", "sms", "whatsapp"] as const;

/**
 * The parts of a WhatsApp message template (see `Template.whatsapp_template`) an admin can edit, flattened to plain
 * strings so they're edited and stored like everything else: the approved template's name and language, and its
 * body parameters one per line.
 */
const WHATSAPP_TEMPLATE_FIELDS = ["whatsappTemplateName", "whatsappTemplateLanguage", "whatsappTemplateParameters"] as const;

/** The parts of a template an admin can edit. `enabled` is separate: it's a switch, not content. */
export const CONTENT_FIELDS = [...TEMPLATE_TEXT_FIELDS, ...WHATSAPP_TEMPLATE_FIELDS] as const;
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
    /** The free-form WhatsApp message, which WhatsApp only delivers within 24 hours of the recipient's last message to you. */
    whatsapp?: string | null;
    /** The name of an approved WhatsApp message template to send instead, which is deliverable to anyone. */
    whatsappTemplateName?: string | null;
    /** The language that template was approved in, like `en_US`. */
    whatsappTemplateLanguage?: string | null;
    /** What fills that template's `{{1}}`, `{{2}}`… — one Handlebars string per line. */
    whatsappTemplateParameters?: string | null;
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

/** A template's WhatsApp message template as the plain strings an admin edits (see `WHATSAPP_TEMPLATE_FIELDS`). */
function whatsAppTemplateFields(template: Template): Record<(typeof WHATSAPP_TEMPLATE_FIELDS)[number], string | undefined> {
    const whatsapp = template.whatsapp_template;
    return {
        whatsappTemplateName: whatsapp?.name,
        whatsappTemplateLanguage: whatsapp?.language,
        whatsappTemplateParameters: whatsapp?.parameters?.length ? whatsapp.parameters.join("\n") : undefined,
    };
}

/** Every part an admin can edit, as it currently reads in `template`. */
export function contentOf(template: Template): Record<ContentField, string | undefined> {
    return {
        subject: template.subject,
        text: template.text,
        html: template.html,
        sms: template.sms,
        whatsapp: template.whatsapp,
        ...whatsAppTemplateFields(template),
    };
}

/**
 * `base` with every field an admin has set laid over it. `base` is expected to come from `resolveTemplate()`. The
 * WhatsApp template's three flattened parts (see `WHATSAPP_TEMPLATE_FIELDS`) are put back together as
 * `whatsapp_template`; without a name there isn't one, so an empty name is how an admin goes back to the free-form message.
 */
export function mergeTemplate(base: DescribedTemplate, override?: MessageTemplateOverride | null): DescribedTemplate {
    const merged: DescribedTemplate = { ...base };
    if (!override) {
        return merged;
    }
    if (override.enabled != null) {
        merged.enabled = override.enabled;
    }
    for (const field of TEMPLATE_TEXT_FIELDS) {
        const value = override[field];
        if (value != null) {
            merged[field] = value;
        }
    }
    if (WHATSAPP_TEMPLATE_FIELDS.some((field) => override[field] != null)) {
        const { whatsappTemplateName: name, whatsappTemplateLanguage: language, whatsappTemplateParameters: parameters } = {
            ...whatsAppTemplateFields(base),
            ...Object.fromEntries(WHATSAPP_TEMPLATE_FIELDS.filter((field) => override[field] != null).map((field) => [field, override[field]])),
        };
        if (name) {
            merged.whatsapp_template = {
                name,
                language: language ?? "",
                parameters: (parameters ?? "")
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean),
            };
        } else {
            delete merged.whatsapp_template;
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

export interface MessageTemplateDetail extends MessageTemplateSummary, Partial<Record<ContentField, string>> {
    /** What each part is with no edits — the editor compares against it and offers to revert to it. */
    defaults: { enabled: boolean } & Partial<Record<ContentField, string>>;
    /** Which parts are currently edited. */
    overridden: { enabled: boolean } & Record<ContentField, boolean>;
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
        ...contentOf(merged),
        defaults: { enabled: base.enabled, ...contentOf(base) },
        overridden: {
            enabled: override?.enabled != null,
            ...(Object.fromEntries(CONTENT_FIELDS.map((field) => [field, override?.[field] != null])) as Record<
                ContentField,
                boolean
            >),
        },
        variables: MESSAGE_VARIABLES,
    };
}

/** Whether `override` sets anything at all. */
export function isCustomized(override?: MessageTemplateOverride | null): boolean {
    return !!override && (override.enabled != null || CONTENT_FIELDS.some((field) => override[field] != null));
}

/**
 * What a template renders to — the parts a real send would hand to the mail/SMS/WhatsApp provider. `null` when that
 * channel wouldn't send. `whatsapp` is the message text or, for an approved WhatsApp template, its name and language
 * with the parameters it would be filled with.
 */
export interface RenderedMessage {
    subject: string | null;
    text: string | null;
    html: string | null;
    sms: string | null;
    whatsapp: string | null;
}

/** What a WhatsApp request body sends, as a person would read it — see `RenderedMessage.whatsapp`. */
function describeWhatsAppRequest(request: any): string | null {
    if (!request) {
        return null;
    }
    if (request.type === "template") {
        const { name, language, components } = request.template;
        const parameters: { text: string }[] = components?.[0]?.parameters ?? [];
        return [
            `Template "${name}" (${language.code})`,
            ...parameters.map((parameter, index) => `{{${index + 1}}}: ${parameter.text}`),
        ].join("\n");
    }
    return request.text.body;
}

/**
 * Renders `template` exactly as a real send would, by running it through a real `MessagingUtils` with only its
 * SMTP/SMS/WhatsApp transports swapped for ones that hand back what they were given. That makes it both the preview
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
    if (template.whatsapp_template && !template.whatsapp_template.language) {
        throw new Error("A WhatsApp template needs the language it was approved in, like en_US.");
    }

    const messaging = new MessagingUtils() as any;
    messaging.templates = {
        from: { email: "preview@example.invalid", sms: "+15555550100" },
        [name]: { ...template, enabled: true },
    };
    messaging.smtpConfig = { host: "preview.invalid" };
    messaging._transporter = { sendMail: async (message: unknown) => message };
    messaging.smsConfig = { provider: "twilio" };
    messaging.twilio = { messages: { create: async (message: unknown) => message } };
    // WhatsApp is sent over HTTP rather than through a client object, so the request that would be made is what's handed back.
    messaging.whatsapp = { accessToken: "preview", phoneNumberId: "0" };
    messaging.postJson = async (_provider: string, _url: string, _token: string, body: unknown) => body;

    const email = (await messaging.sendEmail(name, vars, {})) as { subject?: string; text?: string; html?: string } | undefined;
    const sms = (await messaging.sendSMS(name, vars, {})) as { body?: string } | undefined;
    const whatsapp = await messaging.sendWhatsApp(name, vars, {});
    return {
        subject: email?.subject ?? null,
        text: email?.text ?? null,
        html: email?.html ?? null,
        sms: sms?.body ?? null,
        whatsapp: describeWhatsAppRequest(whatsapp),
    };
}
