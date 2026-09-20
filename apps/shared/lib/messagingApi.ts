///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * The admin console's view of the e-mail/SMS templates this server sends, and of how it sends them: the SMTP server, the
 * Twilio credentials, and the address/number each comes from (see `BaseMessageTemplateRoute`,
 * `BaseSmtpSettingsRoute` and `BaseTwilioSettingsRoute` in `src/routes`). Every endpoint requires the
 * `admin` trusted role, so unlike `siteSettings.ts` none of this is safe to call anonymously.
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
    /** What each part is with no edits. */
    defaults: { enabled: boolean; subject?: string; text?: string; html?: string; sms?: string };
    /** Which parts are currently edited. */
    overridden: { enabled: boolean; subject: boolean; text: boolean; html: boolean; sms: boolean };
    variables: MessageVariable[];
}

/**
 * What to change. An omitted key is left as it is; `null` puts that part back to its default. A string that
 * matches the default exactly is treated as "not edited" by the server, and an empty string is a deliberate empty
 * part (no HTML body, or no SMS at all).
 */
export interface MessageTemplateInput {
    enabled?: boolean | null;
    subject?: string | null;
    text?: string | null;
    html?: string | null;
    sms?: string | null;
}

/** What a template renders to; `null` for a channel it wouldn't send on. */
export interface RenderedMessage {
    subject: string | null;
    text: string | null;
    html: string | null;
    sms: string | null;
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

/**
 * There is deliberately no token here: it's write-only. The server accepts it, stores it encrypted and never returns
 * it, so all that can be known is whether one is set. `configured` is whether a text could be sent right now.
 */
export interface TwilioSettings {
    accountSid?: string;
    tokenSet: boolean;
    /** The phone number or alphanumeric sender ID texts come from. */
    from?: string;
    configured: boolean;
}

/** An omitted key is left as it is; `null` clears it. */
export interface TwilioSettingsInput {
    accountSid?: string | null;
    token?: string | null;
    from?: string | null;
}

export function getTwilioSettings(): Promise<TwilioSettings> {
    return apiFetch("/settings/twilio");
}

export function updateTwilioSettings(input: TwilioSettingsInput): Promise<TwilioSettings> {
    return apiFetch("/settings/twilio", { method: "PUT", body: JSON.stringify(input) });
}

/**
 * Overwrites the Twilio settings with what the deployment's config says, and clears any it doesn't have. Config only
 * seeds these the first time the server starts, so this is how a later change to it reaches the database.
 */
export function resetTwilioSettings(): Promise<TwilioSettings> {
    return apiFetch("/settings/twilio/reset", { method: "POST" });
}

/**
 * As `TwilioSettings`, for e-mail: no password, only whether one is set, and `configured` is whether an e-mail
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

/** As `resetTwilioSettings()`, for the SMTP server, its credentials and the e-mail sender. */
export function resetSmtpSettings(): Promise<SmtpSettings> {
    return apiFetch("/settings/smtp/reset", { method: "POST" });
}
