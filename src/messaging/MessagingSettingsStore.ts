///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError } from "@rapidrest/core";
import { ApiErrors, type RepoUtils } from "@rapidrest/service-core";
import {
    ConfiguredMessaging,
    effectiveSmsProvider,
    MESSAGING_SETTINGS_UID,
    MessagingSettingsEntity,
    messagingFromConfig,
    ResolvedMessaging,
    SecretField,
    seedFieldsFromConfig,
    SmsSettingsDTO,
    SmsSettingsInput,
    smsCredentialsFrom,
    SmtpSettingsDTO,
    SmtpSettingsInput,
    smtpOptionsFrom,
    toSmsSettingsDTO,
    toSmtpSettingsDTO,
    toWhatsAppSettingsDTO,
    validateSmsInput,
    validateSmtpInput,
    validateWhatsAppInput,
    whatsAppCredentialsFrom,
    WhatsAppSettingsDTO,
    WhatsAppSettingsInput,
} from "./MessagingSettings.js";
import { decryptSecret, encryptSecret } from "./SecretBox.js";

/** The fields each card owns, so a reset touches one card's settings and leaves the other's alone. */
const SMTP_FIELDS = {
    plain: ["smtpHost", "smtpPort", "smtpSecure", "smtpUser", "fromEmail"],
    secrets: ["smtpPassword"],
} as const;
const SMS_FIELDS = {
    plain: ["smsProvider", "twilioAccountSid", "telnyxMessagingProfileId", "fromSms"],
    secrets: ["twilioToken", "telnyxApiKey"],
} as const;
const WHATSAPP_FIELDS = {
    plain: ["whatsappPhoneNumberId", "whatsappApiVersion"],
    secrets: ["whatsappAccessToken"],
} as const;

export interface MessagingSettingsStoreDeps {
    repo: () => Promise<RepoUtils<MessagingSettingsEntity>>;
    /** The model class, to build the row that's written. */
    modelClass: new (other?: Partial<MessagingSettingsEntity>) => MessagingSettingsEntity;
    /** The key secrets are encrypted with. Read on each use, so a missing one is only a problem when it's needed. */
    encryptionKey: () => string;
    /** The deployment's `smtp_config`, `templates.from`, `sms_config` and `whatsapp`, read live. */
    configured: () => ConfiguredMessaging;
    warn: (message: string, err: unknown) => void;
}

/**
 * Where the SMTP settings, the sender addresses, the SMS provider's credentials and the WhatsApp credentials live: one
 * row in the database (see `MessagingSettingsSQL`), edited in the admin console. Texts go out through one SMS
 * provider at a time (`smsProvider`); the other's saved settings are kept but not used.
 *
 * **The deployment's config seeds the row, then the row is the source of truth.** The first time the row is read it's
 * filled from `smtp_config`, `templates.from`, `sms_config` and `whatsapp` — only the fields that are still
 * empty, so anything already saved is kept — and marked seeded. From then on config is no longer consulted for those values: an admin
 * clearing a field really clears it, rather than it quietly coming back from config. (The first time is the only time,
 * so changing config afterwards doesn't reach a seeded row; it's edited in the console, or copied in with
 * `resetSmtp()`/`resetSms()`/`resetWhatsApp()`.) Options beyond the
 * modeled fields — nodemailer's `tls`, Twilio's `options` — stay in config and are merged in when the row is used.
 *
 * Until a row is seeded, and whenever it can't be read, config alone applies, so a database problem never stops a
 * code being sent. A saved secret that can't be decrypted (the encryption key changed) falls back to the config's
 * value for that one secret for the same reason.
 */
export class MessagingSettingsStore {
    constructor(private readonly deps: MessagingSettingsStoreDeps) {}

    /** `value` encrypted, or a 500 explaining what's missing: a secret is never stored in the clear as a fallback. */
    private encrypt(value: string): string {
        try {
            return encryptSecret(value, this.deps.encryptionKey());
        } catch {
            throw new ApiError(
                ApiErrors.INTERNAL_ERROR,
                500,
                "A secret can't be stored: `auth:oauth_server:keys:encryption_key` must be set to a 64-character hex string.",
            );
        }
    }

    private async find(): Promise<MessagingSettingsEntity | undefined> {
        return (await (await this.deps.repo()).findOne(MESSAGING_SETTINGS_UID, { ignoreACL: true })) ?? undefined;
    }

    /** The row, seeded from config first if it hasn't been. Throws if it can't be read, or seeded (e.g. no encryption key for a secret in config). */
    async get(): Promise<MessagingSettingsEntity> {
        const existing = await this.find();
        return existing?.seeded ? existing : this.seed(existing);
    }

    private async seed(existing: MessagingSettingsEntity | undefined): Promise<MessagingSettingsEntity> {
        const { plain, secrets } = seedFieldsFromConfig(this.deps.configured());
        const patch: Record<string, unknown> = { seeded: true };
        // Only fill what's still empty: a value saved before seeding existed is the admin's, not config's.
        const isEmpty = (key: string) => existing?.[key as keyof MessagingSettingsEntity] == null;
        for (const [key, value] of Object.entries(plain)) {
            if (value !== undefined && isEmpty(key)) {
                patch[key] = value;
            }
        }
        for (const [key, value] of Object.entries(secrets)) {
            if (value !== undefined && isEmpty(key)) {
                patch[key] = this.encrypt(value);
            }
        }

        const repo = await this.deps.repo();
        try {
            return existing
                ? await repo.update(new this.deps.modelClass({ ...existing, ...patch }), existing, { ignoreACL: true })
                : await repo.create({ uid: MESSAGING_SETTINGS_UID, ...patch }, { ignoreACL: true });
        } catch (err) {
            // Another instance seeded it at the same moment; what it wrote is what would have been.
            const raced = await this.find();
            if (raced?.seeded) {
                return raced;
            }
            throw err;
        }
    }

    /**
     * What's in effect right now, for a send. Never throws: if the row can't be had, config alone applies. Secrets are
     * decrypted here, so this is only ever used to build a transport, never returned to a caller.
     */
    async resolve(): Promise<ResolvedMessaging> {
        const configured = this.deps.configured();
        let row: MessagingSettingsEntity;
        try {
            row = await this.get();
        } catch (err) {
            this.deps.warn("Unable to read the messaging settings, using the deployment config", err);
            return messagingFromConfig(configured);
        }

        const secret = (envelope: string | null | undefined, fallback: string | undefined): string | undefined => {
            if (!envelope) {
                return undefined;
            }
            try {
                return decryptSecret(envelope, this.deps.encryptionKey());
            } catch (err) {
                this.deps.warn("Unable to decrypt a saved secret, using the deployment config's", err);
                return fallback;
            }
        };
        // Only the provider the config names has a config value to fall back to.
        const configuredSms = messagingFromConfig(configured).sms;
        const configuredTwilio = configuredSms?.provider === "twilio" ? configuredSms.config : undefined;
        const configuredTelnyx = configuredSms?.provider === "telnyx" ? configuredSms.config : undefined;
        return {
            smtp: smtpOptionsFrom(
                configured.smtp,
                row.smtpHost || undefined,
                row.smtpPort ?? undefined,
                row.smtpSecure ?? undefined,
                row.smtpUser || undefined,
                secret(row.smtpPassword, configured.smtp?.auth?.pass || undefined),
            ),
            from: { email: row.fromEmail || undefined, sms: row.fromSms || undefined },
            sms: smsCredentialsFrom(effectiveSmsProvider(row), {
                twilioAccountSid: row.twilioAccountSid || undefined,
                twilioToken: secret(row.twilioToken, configuredTwilio?.token),
                twilioOptions: configuredTwilio?.options,
                telnyxApiKey: secret(row.telnyxApiKey, configuredTelnyx?.apiKey),
                telnyxMessagingProfileId: row.telnyxMessagingProfileId || undefined,
            }),
            whatsapp: whatsAppCredentialsFrom(
                secret(row.whatsappAccessToken, configured.whatsapp?.accessToken || undefined),
                row.whatsappPhoneNumberId || undefined,
                row.whatsappApiVersion || undefined,
            ),
        };
    }

    /** Saves `changes` over the (seeded) row. Nothing to save saves nothing. */
    private async save(changes: Partial<MessagingSettingsEntity>): Promise<MessagingSettingsEntity> {
        const existing = await this.get();
        if (Object.keys(changes).length === 0) {
            return existing;
        }
        const repo = await this.deps.repo();
        return repo.update(new this.deps.modelClass({ ...existing, ...changes }), existing, { ignoreACL: true });
    }

    async getSms(): Promise<SmsSettingsDTO> {
        return toSmsSettingsDTO(await this.get());
    }

    /** Encrypts each secret that's being set (`null` clears it) into `changes`; a secret that wasn't sent is left alone. */
    private encryptInto(
        changes: Partial<MessagingSettingsEntity>,
        secrets: Partial<Record<SecretField, string | null>>,
    ): void {
        for (const [key, value] of Object.entries(secrets) as [SecretField, string | null | undefined][]) {
            if (value !== undefined) {
                changes[key] = value === null ? null : this.encrypt(value);
            }
        }
    }

    /** Checked before anything is read or written, so a bad value is refused without side effects. */
    async updateSms(input: SmsSettingsInput): Promise<SmsSettingsDTO> {
        const { fields, secrets } = validateSmsInput(input ?? {});
        const changes: Partial<MessagingSettingsEntity> = { ...fields };
        this.encryptInto(changes, secrets);
        return toSmsSettingsDTO(await this.save(changes));
    }

    async getWhatsApp(): Promise<WhatsAppSettingsDTO> {
        return toWhatsAppSettingsDTO(await this.get());
    }

    async updateWhatsApp(input: WhatsAppSettingsInput): Promise<WhatsAppSettingsDTO> {
        const { fields, accessToken } = validateWhatsAppInput(input ?? {});
        const changes: Partial<MessagingSettingsEntity> = { ...fields };
        this.encryptInto(changes, { whatsappAccessToken: accessToken });
        return toWhatsAppSettingsDTO(await this.save(changes));
    }

    /**
     * Makes `group`'s settings match the deployment's config exactly — the same values seeding would have copied, but
     * overwriting what's saved, and clearing any the config doesn't have — and leaves the other group alone. This is how
     * a change to config after the first start (which seeding, happening once, never picks up) reaches the database.
     * Config is read as of when the server started, so it's a restart that puts new values in front of this.
     *
     * A secret is encrypted before anything is written, so without a valid encryption key this refuses (500) and
     * changes nothing rather than half-resetting.
     */
    private async resetFromConfig(group: {
        plain: readonly (keyof MessagingSettingsEntity)[];
        secrets: readonly SecretField[];
    }): Promise<MessagingSettingsEntity> {
        const { plain, secrets } = seedFieldsFromConfig(this.deps.configured());
        const changes: Partial<MessagingSettingsEntity> = {};
        for (const key of group.plain) {
            (changes as Record<string, unknown>)[key] = plain[key] ?? null;
        }
        for (const key of group.secrets) {
            changes[key] = secrets[key] === undefined ? null : this.encrypt(secrets[key]);
        }
        return this.save(changes);
    }

    /** Puts the SMTP server, its credentials and the e-mail sender back to what the deployment's config says. */
    async resetSmtp(): Promise<SmtpSettingsDTO> {
        return toSmtpSettingsDTO(await this.resetFromConfig(SMTP_FIELDS));
    }

    /** Puts the SMS provider, its credentials and the SMS sender back to what the deployment's config says. */
    async resetSms(): Promise<SmsSettingsDTO> {
        return toSmsSettingsDTO(await this.resetFromConfig(SMS_FIELDS));
    }

    /** Puts the WhatsApp credentials back to what the deployment's config says. */
    async resetWhatsApp(): Promise<WhatsAppSettingsDTO> {
        return toWhatsAppSettingsDTO(await this.resetFromConfig(WHATSAPP_FIELDS));
    }

    async getSmtp(): Promise<SmtpSettingsDTO> {
        return toSmtpSettingsDTO(await this.get());
    }

    async updateSmtp(input: SmtpSettingsInput): Promise<SmtpSettingsDTO> {
        const { fields, password } = validateSmtpInput(input ?? {});
        const changes: Partial<MessagingSettingsEntity> = { ...fields };
        if (password !== undefined) {
            changes.smtpPassword = password === null ? null : this.encrypt(password);
        }
        return toSmtpSettingsDTO(await this.save(changes));
    }
}
