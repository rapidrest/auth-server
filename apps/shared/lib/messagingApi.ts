///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The admin console's view of the e-mail/SMS/WhatsApp templates this server sends, and of how it sends them: the SMTP
 * server, the SMS provider (Twilio or Telnyx) and its credentials, the WhatsApp Business credentials, and the
 * address/number each comes from (see `BaseMessageTemplateRoute`, `BaseSmtpSettingsRoute`, `BaseSmsSettingsRoute` and
 * `BaseWhatsAppSettingsRoute` in `src/routes`). Every endpoint requires the `admin` trusted role, so unlike
 * `siteSettings.ts` none of this is safe to call anonymously.
 */
import { apiFetch } from "./api.js";

export interface MessageVariable {
    name: string;
    description: string;
}

export interface MessageTemplateSummary {
    /** The template's own name, e.g. `login-otp` — what it's addressed by. */
    name: string;
    /** A short name to show people, e.g. `Sign-in code`. */
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
    /** The free-form WhatsApp message, which WhatsApp only delivers within 24 hours of the recipient's last message to you. */
    whatsapp?: string;
    /** The name of an approved WhatsApp message template to send instead, which is deliverable to anyone. */
    whatsappTemplateName?: string;
    /** The language that template was approved in, like `en_US`. Required when there's a template name. */
    whatsappTemplateLanguage?: string;
    /** What fills that template's `{{1}}`, `{{2}}`… — one Handlebars string per line; blank lines are ignored. */
    whatsappTemplateParameters?: string;
    /** What each part is with no edits. */
    defaults: {
        enabled: boolean;
        subject?: string;
        text?: string;
        html?: string;
        sms?: string;
        whatsapp?: string;
        whatsappTemplateName?: string;
        whatsappTemplateLanguage?: string;
        whatsappTemplateParameters?: string;
    };
    /** Which parts are currently edited. */
    overridden: {
        enabled: boolean;
        subject: boolean;
        text: boolean;
        html: boolean;
        sms: boolean;
        whatsapp: boolean;
        whatsappTemplateName: boolean;
        whatsappTemplateLanguage: boolean;
        whatsappTemplateParameters: boolean;
    };
    variables: MessageVariable[];
}

/**
 * What to change. An omitted key is left as it is; `null` puts that part back to its default. A string that
 * matches the default exactly is treated as "not edited" by the server, and an empty string is a deliberate empty
 * part (no HTML body, or no SMS at all). An empty `whatsappTemplateName` is how to go back to sending the free-form
 * `whatsapp` text instead of an approved WhatsApp template.
 */
export interface MessageTemplateInput {
    enabled?: boolean | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    sms?: string | null;
    whatsapp?: string | null;
    whatsappTemplateName?: string | null;
    whatsappTemplateLanguage?: string | null;
    whatsappTemplateParameters?: string | null;
}

/**
 * What a template renders to; `null` for a channel it wouldn't send on. `whatsapp` is the message text or, for an
 * approved WhatsApp template, its name and language followed by the parameters it would be filled with, like
 * `Template "login-otp" (en_US)` then `{{1}}: 123456`.
 */
export interface RenderedMessage {
    subject: string | null;
    text: string | null;
    html: string | null;
    sms: string | null;
    whatsapp: string | null;
}

const BASE = "/settings/messages";

export function listMessageTemplates(): Promise<MessageTemplateSummary[]> {
    return apiFetch(BASE);
}

export function getMessageTemplate(name: string): Promise<MessageTemplateDetail> {
    return apiFetch(`${BASE}/${encodeURIComponent(name)}`);
}

/** Saves edits. Refused with a 400 (and its reason) if the result doesn't render. */
export function updateMessageTemplate(name: string, input: MessageTemplateInput): Promise<MessageTemplateDetail> {
    return apiFetch(`${BASE}/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(input) });
}

/** Discards every edit, putting the template back to its default. */
export function resetMessageTemplate(name: string): Promise<MessageTemplateDetail> {
    return apiFetch(`${BASE}/${encodeURIComponent(name)}`, { method: "DELETE" });
}

/** Renders the template with `input` laid over its default — with the real branding and a sample code — saving nothing. */
export function previewMessageTemplate(name: string, input: MessageTemplateInput): Promise<RenderedMessage> {
    return apiFetch(`${BASE}/${encodeURIComponent(name)}/preview`, { method: "POST", body: JSON.stringify(input) });
}

/** Which service sends text messages. Only one does at a time. */
export type SmsProvider = "twilio" | "telnyx";

/**
 * How text messages go out. Exactly one provider sends them (`provider`); the other's saved settings, if any, are kept
 * for if it's switched back to but play no part. There are deliberately no secrets here: they're write-only. The server
 * accepts them, stores them encrypted and never returns them, so all that can be known is whether one is set.
 * `configured` is whether a text could be sent right now.
 */
export interface SmsSettings {
    provider?: SmsProvider;
    twilio: { accountSid?: string; tokenSet: boolean };
    telnyx: { apiKeySet: boolean; messagingProfileId?: string };
    /** The phone number or alphanumeric sender ID texts come from, whichever provider sends them. */
    from?: string;
    configured: boolean;
}

/**
 * An omitted key is left as it is; `null` (or a blank) clears it. `provider` picks the one that sends texts, and each
 * provider's own block only changes that provider's saved settings, whichever is in use.
 */
export interface SmsSettingsInput {
    provider?: SmsProvider | null;
    twilio?: { accountSid?: string | null; token?: string | null };
    telnyx?: { apiKey?: string | null; messagingProfileId?: string | null };
    from?: string | null;
}

export function getSmsSettings(): Promise<SmsSettings> {
    return apiFetch("/settings/sms");
}

export function updateSmsSettings(input: SmsSettingsInput): Promise<SmsSettings> {
    return apiFetch("/settings/sms", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Overwrites the SMS settings with what the deployment's config says, and clears any it doesn't have. Config only
 * seeds these the first time the server starts, so this is how a later change to it reaches the database.
 */
export function resetSmsSettings(): Promise<SmsSettings> {
    return apiFetch("/settings/sms/reset", { method: "POST" });
}

/**
 * As `SmsSettings`, for WhatsApp: no access token, only whether one is set, and `configured` is whether a message could
 * be sent right now (a phone number ID and an access token).
 */
export interface WhatsAppSettings {
    /** Meta's numeric ID for the WhatsApp Business phone number messages are sent from — not the phone number itself. */
    phoneNumberId?: string;
    accessTokenSet: boolean;
    /** The Graph API version to call, like `v23.0`; the server's default when absent. */
    apiVersion?: string;
    configured: boolean;
}

/** An omitted key is left as it is; `null` clears it. */
export interface WhatsAppSettingsInput {
    phoneNumberId?: string | null;
    accessToken?: string | null;
    apiVersion?: string | null;
}

export function getWhatsAppSettings(): Promise<WhatsAppSettings> {
    return apiFetch("/settings/whatsapp");
}

export function updateWhatsAppSettings(input: WhatsAppSettingsInput): Promise<WhatsAppSettings> {
    return apiFetch("/settings/whatsapp", { method: "PUT", body: JSON.stringify(input) });
}

/** As `resetSmsSettings()`, for the WhatsApp credentials. */
export function resetWhatsAppSettings(): Promise<WhatsAppSettings> {
    return apiFetch("/settings/whatsapp/reset", { method: "POST" });
}

/**
 * As `SmsSettings`, for e-mail: no password, only whether one is set, and `configured` is whether an e-mail
 * could be sent right now (a host and a sender).
 */
export interface SmtpSettings {
    host?: string;
    port?: number;
    /** Whether the connection is encrypted from the start (typically port 465), rather than upgraded afterwards. */
    secure: boolean;
    user?: string;
    passwordSet: boolean;
    /** The address e-mails come from, optionally with a name. */
    from?: string;
    configured: boolean;
}

/** An omitted key is left as it is; `null` clears it. */
export interface SmtpSettingsInput {
    host?: string | null;
    port?: number | null;
    secure?: boolean | null;
    user?: string | null;
    password?: string | null;
    from?: string | null;
}

export function getSmtpSettings(): Promise<SmtpSettings> {
    return apiFetch("/settings/smtp");
}

export function updateSmtpSettings(input: SmtpSettingsInput): Promise<SmtpSettings> {
    return apiFetch("/settings/smtp", { method: "PUT", body: JSON.stringify(input) });
}

/** As `resetSmsSettings()`, for the SMTP server, its credentials and the e-mail sender. */
export function resetSmtpSettings(): Promise<SmtpSettings> {
    return apiFetch("/settings/smtp/reset", { method: "POST" });
}
