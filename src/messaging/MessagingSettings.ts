///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError } from "@rapidrest/core";
import { ApiErrors, type BaseEntity } from "@rapidrest/service-core";

/** The fixed `uid` the single messaging-settings row is always read/written under. */
export const MESSAGING_SETTINGS_UID = "default";

/** The SMS providers a deployment can send through — one at a time, chosen by `smsProvider`. Mirrors `@rapidrest/core`. */
export const SMS_PROVIDERS = ["twilio", "telnyx"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

/** A Twilio Account SID: `AC` followed by 32 hex digits. (The SDK itself refuses anything else as an account.) */
export const TWILIO_ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

/** A Telnyx messaging profile ID: a UUID. Kept loose (letters, digits and dashes) so a change in their format doesn't lock anyone out. */
const TELNYX_MESSAGING_PROFILE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Meta's ID for a WhatsApp Business phone number: a long run of digits (not the phone number itself). */
const WHATSAPP_PHONE_NUMBER_ID = /^\d{5,32}$/;

/** A Graph API version, like `v23.0`. */
const WHATSAPP_API_VERSION = /^v\d{1,3}\.\d{1,2}$/;

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

/** The secrets in the row, each stored as a `SecretBox` envelope. */
export type SecretField = "smtpPassword" | "twilioToken" | "telnyxApiKey" | "whatsappAccessToken";

/**
 * The messaging settings row. Every field is either set or `null`, and secrets (see `SecretField`) are `SecretBox`
 * envelopes, never plaintext.
 */
export interface MessagingSettingsEntity extends BaseEntity {
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean | null;
    smtpUser?: string | null;
    smtpPassword?: string | null;
    fromEmail?: string | null;
    /** Which SMS provider sends texts. `null` means "whichever has credentials" — see `effectiveSmsProvider()`. */
    smsProvider?: SmsProvider | null;
    twilioAccountSid?: string | null;
    twilioToken?: string | null;
    telnyxApiKey?: string | null;
    telnyxMessagingProfileId?: string | null;
    /** The number or sender ID texts come from, whichever provider sends them. */
    fromSms?: string | null;
    whatsappPhoneNumberId?: string | null;
    whatsappAccessToken?: string | null;
    whatsappApiVersion?: string | null;
    /** Set once the row has been filled from the deployment's config, after which the row is the source of truth. */
    seeded?: boolean | null;
}

/** The deployment's config blocks that seed the row, as they're found in config. */
export interface ConfiguredMessaging {
    smtp?: ({ host?: string; port?: number; secure?: boolean; auth?: { user?: string; pass?: string } } & Record<string, unknown>) | null;
    from?: { email?: string; sms?: string } | null;
    /** `sms_config`: the provider that sends texts, and that provider's own settings. */
    sms?: { provider?: string; config?: Record<string, unknown> } | null;
    /** `whatsapp`: the WhatsApp Business Cloud API credentials. */
    whatsapp?: { accessToken?: string; phoneNumberId?: string; apiVersion?: string } | null;
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
    /** Extra options for the SDK, from the deployment's `sms_config.config.options`. */
    options?: unknown;
}

/** What Telnyx requests are authorized with, and sent through. */
export interface TelnyxCredentials {
    apiKey: string;
    messagingProfileId?: string;
}

/** What WhatsApp messages are sent with — the shape `@rapidrest/core`'s `whatsapp` config takes. */
export interface WhatsAppCredentials {
    accessToken: string;
    phoneNumberId: string;
    apiVersion?: string;
}

/** The SMS provider in use and its credentials — one, never both. The shape `@rapidrest/core`'s `sms_config` takes. */
export type ResolvedSms =
    | { provider: "twilio"; config: TwilioCredentials }
    | { provider: "telnyx"; config: TelnyxCredentials };

/** What's in effect right now, wherever it came from. */
export interface ResolvedMessaging {
    smtp?: SmtpOptions;
    from: { email?: string; sms?: string };
    sms?: ResolvedSms;
    whatsapp?: WhatsAppCredentials;
}

/** A blank config value is the same as none. */
function present<T>(value: T | null | undefined | ""): T | undefined {
    return value === null || value === undefined || value === "" ? undefined : value;
}

/** A config value that's usable as text: a non-blank string, trimmed. Anything else is the same as none. */
function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isSmsProvider(value: unknown): value is SmsProvider {
    return (SMS_PROVIDERS as readonly unknown[]).includes(value);
}

/**
 * The provider a saved row sends texts through: the one it names or, for a row saved before there was a choice,
 * whichever has credentials (Twilio, which was the only one, first). `undefined` when neither does.
 */
export function effectiveSmsProvider(row: MessagingSettingsEntity): SmsProvider | undefined {
    if (row.smsProvider) {
        return row.smsProvider;
    }
    if (row.twilioAccountSid || row.twilioToken) {
        return "twilio";
    }
    return row.telnyxApiKey ? "telnyx" : undefined;
}

/** The deployment's `sms_config` as far as it names a provider we know: that provider and its settings. */
function configuredSms(sms: ConfiguredMessaging["sms"]): { provider: SmsProvider; config: Record<string, unknown> } | undefined {
    const provider = text(sms?.provider);
    return isSmsProvider(provider) ? { provider, config: sms?.config ?? {} } : undefined;
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

/** The Twilio or Telnyx credentials in effect, or `undefined` unless the chosen provider has everything it needs. */
export function smsCredentialsFrom(
    provider: SmsProvider | undefined,
    values: {
        twilioAccountSid?: string;
        twilioToken?: string;
        twilioOptions?: unknown;
        telnyxApiKey?: string;
        telnyxMessagingProfileId?: string;
    },
): ResolvedSms | undefined {
    if (provider === "twilio" && values.twilioAccountSid && values.twilioToken) {
        return {
            provider,
            config: { accountSid: values.twilioAccountSid, token: values.twilioToken, options: values.twilioOptions },
        };
    }
    if (provider === "telnyx" && values.telnyxApiKey) {
        return {
            provider,
            config: {
                apiKey: values.telnyxApiKey,
                ...(values.telnyxMessagingProfileId ? { messagingProfileId: values.telnyxMessagingProfileId } : {}),
            },
        };
    }
    return undefined;
}

/** The WhatsApp credentials in effect, or `undefined` unless there's both an access token and a phone number ID. */
export function whatsAppCredentialsFrom(
    accessToken: string | undefined,
    phoneNumberId: string | undefined,
    apiVersion: string | undefined,
): WhatsAppCredentials | undefined {
    return accessToken && phoneNumberId
        ? { accessToken, phoneNumberId, ...(apiVersion ? { apiVersion } : {}) }
        : undefined;
}

/** What's in effect when the config alone is consulted: before the row is seeded, or if it can't be read. */
export function messagingFromConfig(configured: ConfiguredMessaging): ResolvedMessaging {
    const { smtp, from, whatsapp } = configured;
    const sms = configuredSms(configured.sms);
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
        sms: smsCredentialsFrom(sms?.provider, {
            twilioAccountSid: text(sms?.config.accountSid),
            twilioToken: text(sms?.config.token),
            twilioOptions: sms?.config.options,
            telnyxApiKey: text(sms?.config.apiKey),
            telnyxMessagingProfileId: text(sms?.config.messagingProfileId),
        }),
        whatsapp: whatsAppCredentialsFrom(text(whatsapp?.accessToken), text(whatsapp?.phoneNumberId), text(whatsapp?.apiVersion)),
    };
}

/** The values the deployment's config would seed the row with; a blank one seeds nothing. Secrets are still plaintext here. */
export function seedFieldsFromConfig(configured: ConfiguredMessaging): {
    plain: Partial<MessagingSettingsEntity>;
    secrets: Partial<Record<SecretField, string>>;
} {
    const { smtp, from, whatsapp } = configured;
    const sms = configuredSms(configured.sms);
    const twilio = sms?.provider === "twilio" ? sms.config : undefined;
    const telnyx = sms?.provider === "telnyx" ? sms.config : undefined;
    const plain: Partial<MessagingSettingsEntity> = {
        smtpHost: present(smtp?.host),
        smtpPort: present(smtp?.port),
        smtpSecure: present(smtp?.secure),
        smtpUser: present(smtp?.auth?.user),
        fromEmail: present(from?.email),
        fromSms: present(from?.sms),
        smsProvider: sms?.provider,
        twilioAccountSid: text(twilio?.accountSid),
        telnyxMessagingProfileId: text(telnyx?.messagingProfileId),
        whatsappPhoneNumberId: text(whatsapp?.phoneNumberId),
        whatsappApiVersion: text(whatsapp?.apiVersion),
    };
    const secrets = {
        smtpPassword: present(smtp?.auth?.pass),
        twilioToken: text(twilio?.token),
        telnyxApiKey: text(telnyx?.apiKey),
        whatsappAccessToken: text(whatsapp?.accessToken),
    };
    return { plain, secrets };
}

// -- What the admin console is shown ---------------------------------------------------------------------------------

/**
 * How texts go out. Exactly one provider is in use (`provider`); the other's saved settings, if any, are kept for if it's
 * switched back to but play no part. There are deliberately no secrets here: they're only ever accepted, never
 * returned, so all the console can know is whether one is set. `configured` is whether a text could be sent right now.
 */
export interface SmsSettingsDTO {
    provider?: SmsProvider;
    twilio: { accountSid?: string; tokenSet: boolean };
    telnyx: { apiKeySet: boolean; messagingProfileId?: string };
    /** The number or sender ID texts come from, whichever provider sends them. */
    from?: string;
    configured: boolean;
}

/** As `SmsSettingsDTO`, for WhatsApp: `accessTokenSet` rather than the token, and `configured` for whether a message could be sent. */
export interface WhatsAppSettingsDTO {
    phoneNumberId?: string;
    accessTokenSet: boolean;
    apiVersion?: string;
    configured: boolean;
}

/** As `SmsSettingsDTO`, for e-mail: `passwordSet` rather than the password, and `configured` for whether one could be sent. */
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

export function toSmsSettingsDTO(row: MessagingSettingsEntity): SmsSettingsDTO {
    const provider = effectiveSmsProvider(row);
    const providerReady =
        provider === "twilio" ? !!row.twilioAccountSid && !!row.twilioToken : provider === "telnyx" && !!row.telnyxApiKey;
    return {
        provider,
        twilio: { accountSid: row.twilioAccountSid || undefined, tokenSet: !!row.twilioToken },
        telnyx: { apiKeySet: !!row.telnyxApiKey, messagingProfileId: row.telnyxMessagingProfileId || undefined },
        from: row.fromSms || undefined,
        configured: providerReady && !!row.fromSms,
    };
}

export function toWhatsAppSettingsDTO(row: MessagingSettingsEntity): WhatsAppSettingsDTO {
    const accessTokenSet = !!row.whatsappAccessToken;
    return {
        phoneNumberId: row.whatsappPhoneNumberId || undefined,
        accessTokenSet,
        apiVersion: row.whatsappApiVersion || undefined,
        configured: accessTokenSet && !!row.whatsappPhoneNumberId,
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

/**
 * An omitted key is untouched; `null` (or, for text, a blank) clears it. `provider` picks the one provider that sends
 * texts; each provider's own block only changes that provider's saved settings, whichever is in use.
 */
export interface SmsSettingsInput {
    provider?: SmsProvider | null;
    twilio?: { accountSid?: string | null; token?: string | null };
    telnyx?: { apiKey?: string | null; messagingProfileId?: string | null };
    from?: string | null;
}

export interface WhatsAppSettingsInput {
    phoneNumberId?: string | null;
    accessToken?: string | null;
    apiVersion?: string | null;
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
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (!isValid(trimmed)) {
        invalid(problem);
    }
    return trimmed;
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

/** A nested block of an input: absent is untouched, an object is read, and anything else can't be right. */
function checkedBlock<T extends object>(value: unknown, name: string): T | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        invalid(`\`${name}\` must be an object.`);
    }
    return value as T;
}

const SENDER_SMS_PROBLEM =
    "The sender must be a phone number in international format, like +15555550100, or an alphanumeric sender ID of up to 11 characters.";

/**
 * The changes `input` asks for on the SMS side, checked, with the secrets still plaintext (the caller encrypts them).
 * Throws a 400 for a value that can't be right, so a typo is caught here rather than as every text failing later.
 */
export function validateSmsInput(input: SmsSettingsInput): {
    fields: Partial<MessagingSettingsEntity>;
    secrets: Partial<Record<"twilioToken" | "telnyxApiKey", string | null>>;
} {
    const fields: Partial<MessagingSettingsEntity> = {};
    const secrets: Partial<Record<"twilioToken" | "telnyxApiKey", string | null>> = {};

    if (input.provider !== undefined) {
        if (input.provider !== null && !isSmsProvider(input.provider)) {
            invalid(`The provider must be one of: ${SMS_PROVIDERS.join(", ")}.`);
        }
        fields.smsProvider = input.provider;
    }
    if (input.from !== undefined) {
        fields.fromSms = checkedText(
            input.from,
            (sender) => PHONE_NUMBER_SENDER.test(sender) || ALPHANUMERIC_SENDER.test(sender),
            SENDER_SMS_PROBLEM,
        );
    }

    const twilio = checkedBlock<NonNullable<SmsSettingsInput["twilio"]>>(input.twilio, "twilio");
    if (twilio?.accountSid !== undefined) {
        fields.twilioAccountSid = checkedText(
            twilio.accountSid,
            (sid) => TWILIO_ACCOUNT_SID_PATTERN.test(sid),
            "The account SID must be 'AC' followed by 32 hexadecimal digits.",
        );
    }
    if (twilio?.token !== undefined) {
        secrets.twilioToken = checkedSecret(twilio.token, "auth token", true);
    }

    const telnyx = checkedBlock<NonNullable<SmsSettingsInput["telnyx"]>>(input.telnyx, "telnyx");
    if (telnyx?.messagingProfileId !== undefined) {
        fields.telnyxMessagingProfileId = checkedText(
            telnyx.messagingProfileId,
            (id) => TELNYX_MESSAGING_PROFILE_ID.test(id),
            "The messaging profile ID must be letters, digits and dashes, like the ID shown in the Telnyx portal.",
        );
    }
    if (telnyx?.apiKey !== undefined) {
        secrets.telnyxApiKey = checkedSecret(telnyx.apiKey, "API key", true);
    }
    return { fields, secrets };
}

/** As `validateSmsInput()`, for WhatsApp. */
export function validateWhatsAppInput(input: WhatsAppSettingsInput): {
    fields: Partial<MessagingSettingsEntity>;
    accessToken?: string | null;
} {
    const fields: Partial<MessagingSettingsEntity> = {};
    if (input.phoneNumberId !== undefined) {
        fields.whatsappPhoneNumberId = checkedText(
            input.phoneNumberId,
            (id) => WHATSAPP_PHONE_NUMBER_ID.test(id),
            "The phone number ID must be the digits Meta shows for the number in WhatsApp Manager — not the phone number itself.",
        );
    }
    if (input.apiVersion !== undefined) {
        fields.whatsappApiVersion = checkedText(
            input.apiVersion,
            (version) => WHATSAPP_API_VERSION.test(version),
            "The API version must look like v23.0.",
        );
    }
    return {
        fields,
        accessToken: input.accessToken === undefined ? undefined : checkedSecret(input.accessToken, "access token", true),
    };
}

/** As `validateSmsInput()`, for e-mail. */
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
