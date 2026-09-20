///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError } from "@rapidrest/core";
import { ApiErrors, type BaseEntity } from "@rapidrest/service-core";

/** The fixed `uid` the single messaging-settings row is always read/written under. */
export const MESSAGING_SETTINGS_UID = "default";

/** A Twilio Account SID: `AC` followed by 32 hex digits. (The SDK itself refuses anything else as an account.) */
export const TWILIO_ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

/**
 * What a text can come from: a phone number in international format, or an alphanumeric sender ID (up to 11
 * characters, at least one a letter). A Messaging Service SID isn't allowed: it has to go in a different request
 * field than the `from` that `MessagingUtils` sends.
 */
const PHONE_NUMBER_SENDER = /^\+[1-9]\d{1,14}$/;
const ALPHANUMERIC_SENDER = /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/;

/** An address (`no-reply@acme.test`) or a named one (`Acme <no-reply@acme.test>`). No line breaks, ever. */
const EMAIL_SENDER = /^(?:[^<>\r\n]+<[^\s@<>]+@[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+)$/;

/** A host name or IP address: letters, digits and `.:_-`, with no scheme, port or path. */
const SMTP_HOST = /^[A-Za-z0-9.:_-]{1,255}$/;

/** Far longer than any real credential; it only bounds what's stored. */
export const MAX_SECRET_LENGTH = 256;
const MAX_SENDER_LENGTH = 320;

/**
 * The messaging settings row. Every field is either set or `null`, and secrets (`twilioToken`, `smtpPassword`) are
 * `SecretBox` envelopes, never plaintext.
 */
export interface MessagingSettingsEntity extends BaseEntity {
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean | null;
    smtpUser?: string | null;
    smtpPassword?: string | null;
    fromEmail?: string | null;
    twilioAccountSid?: string | null;
    twilioToken?: string | null;
    fromSms?: string | null;
    /** Set once the row has been filled from the deployment's config, after which the row is the source of truth. */
    seeded?: boolean | null;
}

/** The deployment's config blocks that seed the row, as they're found in config. */
export interface ConfiguredMessaging {
    smtp?: ({ host?: string; port?: number; secure?: boolean; auth?: { user?: string; pass?: string } } & Record<string, unknown>) | null;
    from?: { email?: string; sms?: string } | null;
    twilio?: { accountSid?: string; token?: string; options?: unknown } | null;
}

/** What nodemailer is built from. Anything beyond the modeled fields (e.g. `tls`) comes from the deployment's config. */
export type SmtpOptions = { host: string; port?: number; secure?: boolean; auth?: { user: string; pass: string } } & Record<
    string,
    unknown
>;

/** What a Twilio client is built from. */
export interface TwilioCredentials {
    accountSid: string;
    token: string;
    /** Extra options for the SDK, from the deployment's `twilio` config. */
    options?: unknown;
}

/** What's in effect right now, wherever it came from. */
export interface ResolvedMessaging {
    smtp?: SmtpOptions;
    from: { email?: string; sms?: string };
    twilio?: TwilioCredentials;
}

/** A blank config value is the same as none. */
function present<T>(value: T | null | undefined | ""): T | undefined {
    return value === null || value === undefined || value === "" ? undefined : value;
}

/** The modeled SMTP fields, with the deployment's remaining nodemailer options laid underneath. `undefined` without a host. */
export function smtpOptionsFrom(
    base: ConfiguredMessaging["smtp"],
    host: string | undefined,
    port: number | undefined,
    secure: boolean | undefined,
    user: string | undefined,
    pass: string | undefined,
): SmtpOptions | undefined {
    if (!host) {
        return undefined;
    }
    const { host: _host, port: _port, secure: _secure, auth: _auth, ...extras } = base ?? {};
    return {
        ...extras,
        host,
        ...(port !== undefined ? { port } : {}),
        ...(secure !== undefined ? { secure } : {}),
        ...(user && pass ? { auth: { user, pass } } : {}),
    };
}

/** What's in effect when the config alone is consulted: before the row is seeded, or if it can't be read. */
export function messagingFromConfig(configured: ConfiguredMessaging): ResolvedMessaging {
    const { smtp, from, twilio } = configured;
    return {
        smtp: smtpOptionsFrom(
            smtp,
            present(smtp?.host),
            present(smtp?.port),
            present(smtp?.secure),
            present(smtp?.auth?.user),
            present(smtp?.auth?.pass),
        ),
        from: { email: present(from?.email), sms: present(from?.sms) },
        twilio:
            present(twilio?.accountSid) && present(twilio?.token)
                ? { accountSid: twilio!.accountSid!, token: twilio!.token!, options: twilio?.options }
                : undefined,
    };
}

/** The values the deployment's config would seed the row with; a blank one seeds nothing. Secrets are still plaintext here. */
export function seedFieldsFromConfig(configured: ConfiguredMessaging): {
    plain: Partial<MessagingSettingsEntity>;
    secrets: Partial<Record<"twilioToken" | "smtpPassword", string>>;
} {
    const { smtp, from, twilio } = configured;
    const plain: Partial<MessagingSettingsEntity> = {
        smtpHost: present(smtp?.host),
        smtpPort: present(smtp?.port),
        smtpSecure: present(smtp?.secure),
        smtpUser: present(smtp?.auth?.user),
        fromEmail: present(from?.email),
        fromSms: present(from?.sms),
        twilioAccountSid: present(twilio?.accountSid),
    };
    const secrets = { smtpPassword: present(smtp?.auth?.pass), twilioToken: present(twilio?.token) };
    return { plain, secrets };
}

// -- What the admin console is shown ---------------------------------------------------------------------------------

/**
 * There is deliberately no token here: it's only ever accepted, never returned, so all the console can know is whether
 * one is set. `configured` is whether a text could be sent right now.
 */
export interface TwilioSettingsDTO {
    accountSid?: string;
    tokenSet: boolean;
    /** The number or sender ID texts come from. */
    from?: string;
    configured: boolean;
}

/** As `TwilioSettingsDTO`, for e-mail: `passwordSet` rather than the password, and `configured` for whether one could be sent. */
export interface SmtpSettingsDTO {
    host?: string;
    port?: number;
    secure: boolean;
    user?: string;
    passwordSet: boolean;
    /** The address e-mails come from. */
    from?: string;
    configured: boolean;
}

export function toTwilioSettingsDTO(row: MessagingSettingsEntity): TwilioSettingsDTO {
    const tokenSet = !!row.twilioToken;
    return {
        accountSid: row.twilioAccountSid || undefined,
        tokenSet,
        from: row.fromSms || undefined,
        configured: !!row.twilioAccountSid && tokenSet && !!row.fromSms,
    };
}

export function toSmtpSettingsDTO(row: MessagingSettingsEntity): SmtpSettingsDTO {
    return {
        host: row.smtpHost || undefined,
        port: row.smtpPort ?? undefined,
        secure: !!row.smtpSecure,
        user: row.smtpUser || undefined,
        passwordSet: !!row.smtpPassword,
        from: row.fromEmail || undefined,
        configured: !!row.smtpHost && !!row.fromEmail,
    };
}

// -- What the admin console may send -----------------------------------------------------------------------------------

/** An omitted key is untouched; `null` (or, for text, a blank) clears it. */
export interface TwilioSettingsInput {
    accountSid?: string | null;
    token?: string | null;
    from?: string | null;
}

export interface SmtpSettingsInput {
    host?: string | null;
    port?: number | null;
    secure?: boolean | null;
    user?: string | null;
    password?: string | null;
    from?: string | null;
}

function invalid(message: string): never {
    throw new ApiError(ApiErrors.INVALID_REQUEST, 400, message);
}

/**
 * A text value that's either cleared (`null` or blank) or trimmed and checked; anything that isn't text is refused.
 * `undefined` is "not sent" and is left for the caller to skip.
 */
function checkedText(value: unknown, isValid: (text: string) => boolean, problem: string): string | null {
    if (value === null) {
        return null;
    }
    if (typeof value !== "string") {
        invalid(problem);
    }
    const text = value.trim();
    if (!text) {
        return null;
    }
    if (!isValid(text)) {
        invalid(problem);
    }
    return text;
}

/**
 * A secret that's either cleared (`null`) or a non-empty string. Trimmed only when `trim` says whitespace around it is
 * a paste error (an API token); a password may legitimately begin or end with a space.
 */
function checkedSecret(value: unknown, what: string, trim: boolean): string | null {
    if (value === null) {
        return null;
    }
    if (typeof value !== "string" || !value.trim() || value.length > MAX_SECRET_LENGTH) {
        invalid(`The ${what} must be a non-empty string.`);
    }
    return trim ? value.trim() : value;
}

const SENDER_SMS_PROBLEM =
    "The sender must be a phone number in international format, like +15555550100, or an alphanumeric sender ID of up to 11 characters.";

/**
 * The changes `input` asks for on the Twilio side, checked, with the token still plaintext (the caller encrypts it).
 * Throws a 400 for a value that can't be right, so a typo is caught here rather than as every text failing later.
 */
export function validateTwilioInput(input: TwilioSettingsInput): {
    fields: Partial<MessagingSettingsEntity>;
    token?: string | null;
} {
    const fields: Partial<MessagingSettingsEntity> = {};
    if (input.accountSid !== undefined) {
        fields.twilioAccountSid = checkedText(
            input.accountSid,
            (sid) => TWILIO_ACCOUNT_SID_PATTERN.test(sid),
            "The account SID must be 'AC' followed by 32 hexadecimal digits.",
        );
    }
    if (input.from !== undefined) {
        fields.fromSms = checkedText(
            input.from,
            (sender) => PHONE_NUMBER_SENDER.test(sender) || ALPHANUMERIC_SENDER.test(sender),
            SENDER_SMS_PROBLEM,
        );
    }
    return { fields, token: input.token === undefined ? undefined : checkedSecret(input.token, "auth token", true) };
}

/** As `validateTwilioInput()`, for e-mail. */
export function validateSmtpInput(input: SmtpSettingsInput): {
    fields: Partial<MessagingSettingsEntity>;
    password?: string | null;
} {
    const fields: Partial<MessagingSettingsEntity> = {};
    if (input.host !== undefined) {
        fields.smtpHost = checkedText(
            input.host,
            (host) => SMTP_HOST.test(host),
            "The host must be a host name or IP address, without a scheme, port or path.",
        );
    }
    if (input.port !== undefined) {
        if (input.port !== null && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
            invalid("The port must be a whole number from 1 to 65535.");
        }
        fields.smtpPort = input.port;
    }
    if (input.secure !== undefined) {
        if (input.secure !== null && typeof input.secure !== "boolean") {
            invalid("`secure` must be true, false or null.");
        }
        fields.smtpSecure = input.secure;
    }
    if (input.user !== undefined) {
        fields.smtpUser = checkedText(input.user, (user) => user.length <= MAX_SECRET_LENGTH, "The user name must be text of a reasonable length.");
    }
    if (input.from !== undefined) {
        fields.fromEmail = checkedText(
            input.from,
            (sender) => sender.length <= MAX_SENDER_LENGTH && EMAIL_SENDER.test(sender),
            "The sender must be an e-mail address, like no-reply@example.com, optionally with a name: Example <no-reply@example.com>.",
        );
    }
    return { fields, password: input.password === undefined ? undefined : checkedSecret(input.password, "password", false) };
}
