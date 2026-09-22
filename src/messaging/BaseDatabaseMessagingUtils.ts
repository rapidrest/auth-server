///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators, type Template } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, BaseEntity, ObjectFactory, RepoUtils } from "@rapidrest/service-core";
import { readPublicSiteSettings, type PublicSiteSettings } from "../routes/BaseSiteSettingsRoute.js";
import {
    buildBrand,
    CONTENT_FIELDS,
    contentOf,
    describeTemplate,
    DescribedTemplate,
    isCustomized,
    MessageBrand,
    MessageTemplateDetail,
    MessageTemplateEntity,
    MessageTemplateOverride,
    MessageTemplateSummary,
    mergeTemplate,
    RenderedMessage,
    renderTemplate,
    resolveTemplate,
    SAMPLE_CODE,
    summarizeTemplate,
} from "./MessageTemplates.js";
import {
    ConfiguredMessaging,
    MessagingSettingsEntity,
    messagingFromConfig,
    ResolvedSms,
    SmsSettingsDTO,
    SmsSettingsInput,
    SmtpOptions,
    SmtpSettingsDTO,
    SmtpSettingsInput,
    TwilioCredentials,
    WhatsAppSettingsDTO,
    WhatsAppSettingsInput,
} from "./MessagingSettings.js";
import { MessagingSettingsStore } from "./MessagingSettingsStore.js";

const { Config, Init } = ObjectDecorators;

/** The largest any one part of a template may be. Far more than a message needs; it just bounds what's stored. */
const MAX_FIELD_LENGTH = 100_000;

/**
 * The `MessagingUtils` this server runs: the same class every `@rapidrest/auth` route already injects, but with
 * two additions, so the messages it sends can be changed without a redeploy and always look like the site.
 *
 * **Templates from the database.** Each template the config defines (see `DEFAULT_MESSAGE_TEMPLATES`) is laid over
 * with whatever an admin has saved for it (see `MessageTemplateSQL`) every time one is sent. Reading goes through
 * `RepoUtils`, whose cache is shared across instances, so an edit reaches every replica at once with no
 * invalidation of its own to get wrong. If the database can't be read the default is sent instead: a login code
 * arriving in the old wording is better than not arriving.
 *
 * **Branding.** Every template can use `{{brand.name}}`, `{{brand.logoUrl}}` and the rest (see
 * `MESSAGE_VARIABLES`), taken from the site branding, so a message looks like the site without each template
 * repeating it. The caller's own variables win if they pass a `brand` of their own.
 *
 * **Transport settings from the database.** The SMTP server, the SMS provider's credentials (Twilio or Telnyx — one at
 * a time), the WhatsApp credentials and the address/number messages come from are saved through the admin console (see
 * `MessagingSettingsStore`), seeded once from the deployment's config and the source of truth after that. The SMTP
 * transport and the SMS and WhatsApp clients are rebuilt whenever what's in effect changes, so a rotated password or
 * token is used by the very next message with no restart.
 *
 * It's swapped in by registering it under the name `MessagingUtils` (see `src/sql/MessagingUtils.ts`), which is how
 * `ObjectFactory` finds the class each route's `@Inject(MessagingUtils)` asks for — nothing in `@rapidrest/auth`
 * needs to know.
 *
 * Also the one place templates are read, edited and previewed for the admin console (see
 * `BaseMessageTemplateRoute`), so that what's previewed and validated is exactly what a send would render.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseDatabaseMessagingUtils extends MessagingUtils {
    protected abstract templateClass: any;
    protected abstract settingsClass: any;
    protected abstract messagingSettingsClass: any;

    // Automatically injected by ObjectFactory on instantiation.
    protected _objectFactory?: ObjectFactory;

    /**
     * The templates as configured — read live and never written to. `MessagingUtils` keeps its own reference to the
     * same config (`templates`), which this deliberately does not: that reference is redirected to a private working
     * copy (see `workingTemplates()`) because nconf hands out nested config objects by reference, so writing an
     * admin's edits into it would rewrite the shared config for everything else that reads it.
     */
    @Config("templates", {})
    protected configuredTemplates: Record<string, any> = {};

    /** This server's public address, used to make the logo address absolute. See `buildBrand()`. */
    @Config("auth:oauth_server:issuer", "")
    protected serverUrl: string = "";

    /** The deployment's `site_settings` config, which seeds the branding row if a message is the first thing to read it. */
    @Config("site_settings", null)
    protected configuredSiteSettings: unknown = null;

    /**
     * The key the messaging secrets (SMTP password, SMS and WhatsApp tokens) are encrypted with at rest — the same 64-character hex AES-256 key that already
     * encrypts signing keys (see `config.defaults.ts`), which production refuses to start with its default.
     */
    @Config("auth:oauth_server:keys:encryption_key", "")
    protected encryptionKey: string = "";

    /**
     * The deployment's `smtp_config`, `sms_config` and `whatsapp`, read live and never written to. `MessagingUtils`
     * keeps its own `smtpConfig`/`smsConfig`/`twilio`/`telnyx`/`whatsapp`, which `syncSmtp()`/`syncSms()`/
     * `syncWhatsApp()` overwrite with what's in effect — these are what the database is seeded from, and what applies
     * while it can't be read.
     */
    @Config("smtp_config", null)
    protected configuredSmtp: ConfiguredMessaging["smtp"] = null;

    @Config("sms_config", null)
    protected configuredSms: ConfiguredMessaging["sms"] = null;

    @Config("whatsapp", null)
    protected configuredWhatsApp: ConfiguredMessaging["whatsapp"] = null;

    private repos = new Map<unknown, RepoUtils<any>>();
    private ownsTemplates = false;
    private settingsStore?: MessagingSettingsStore;
    /** What the current SMTP transport / SMS client were built from, as comparable strings. Unset until first needed. */
    private smtpKey?: string;
    private smsKey?: string;

    private warn(message: string, err: unknown): void {
        (this as any).logger?.warn(`${message}: ${err instanceof Error ? err.message : String(err)}`);
    }

    private async repoFor<E extends BaseEntity>(modelClass: any): Promise<RepoUtils<E>> {
        if (!this._objectFactory) {
            throw new Error("objectFactory is not set.");
        }
        let repo = this.repos.get(modelClass);
        if (!repo) {
            repo = await this._objectFactory.newInstance(RepoUtils, { name: modelClass.name, args: [modelClass] });
            this.repos.set(modelClass, repo as RepoUtils<any>);
        }
        return repo as RepoUtils<E>;
    }

    /** The deployment's messaging config, as the store seeds from and falls back to it. */
    private configuredMessaging(): ConfiguredMessaging {
        return {
            smtp: this.configuredSmtp,
            from: this.configuredTemplates.from,
            sms: this.configuredSms,
            whatsapp: this.configuredWhatsApp,
        };
    }

    /** Where the SMTP, sender, SMS and WhatsApp settings live. */
    private get settings(): MessagingSettingsStore {
        if (!this.settingsStore) {
            this.settingsStore = new MessagingSettingsStore({
                repo: () => this.repoFor<MessagingSettingsEntity>(this.messagingSettingsClass),
                modelClass: this.messagingSettingsClass,
                encryptionKey: () => this.encryptionKey,
                configured: () => this.configuredMessaging(),
                warn: (message, err) => this.warn(message, err),
            });
        }
        return this.settingsStore;
    }

    /**
     * Seeds the messaging settings from config as the server starts, so the console shows them straight away. Best
     * effort: they're seeded on first use anyway, and until they are, config applies — so a failure here (say the
     * database isn't reachable yet) must not stop the server.
     */
    @Init
    protected async seedMessagingSettings(): Promise<void> {
        try {
            await this.settings.get();
        } catch (err) {
            this.warn("Unable to seed the messaging settings from config, so config applies until they are", err);
        }
    }

    private getTemplateRepo(): Promise<RepoUtils<MessageTemplateEntity>> {
        return this.repoFor<MessageTemplateEntity>(this.templateClass);
    }

    /**
     * The admin's saved edits for `name`, if any. With `lenient` (a real send) a failed read is logged and treated as
     * "no edits" so the default is still sent; otherwise (the admin console) it's thrown so it can be seen.
     */
    private async findOverride(name: string, lenient: boolean): Promise<MessageTemplateEntity | undefined> {
        try {
            const repo = await this.getTemplateRepo();
            return (await repo.findOne(name, { ignoreACL: true })) ?? undefined;
        } catch (err) {
            if (!lenient) {
                throw err;
            }
            this.warn(`Unable to read the saved edits for message template '${name}', using the default`, err);
            return undefined;
        }
    }

    /** The branding every template can use as `brand`. A failed read falls back to the stock brand rather than blocking a send. */
    private async loadBrand(): Promise<MessageBrand> {
        let settings: PublicSiteSettings | undefined;
        try {
            if (!this._objectFactory) {
                throw new Error("objectFactory is not set.");
            }
            settings = await readPublicSiteSettings(this._objectFactory, this.settingsClass, this.configuredSiteSettings);
        } catch (err) {
            this.warn("Unable to read the site branding for a message, using the stock brand", err);
        }
        return buildBrand(settings, this.serverUrl);
    }

    /** The private copy of the templates `MessagingUtils` actually renders from. Starts empty; `loadTemplate()` fills it in per send. */
    private workingTemplates(): Record<string, any> {
        const self = this as any;
        if (!this.ownsTemplates) {
            self.templates = {};
            this.ownsTemplates = true;
        }
        return self.templates;
    }

    /** The configured template called `name`, files read in. Throws a 404 if there's no such template to edit. */
    private async requireDefault(name: string): Promise<DescribedTemplate> {
        const base = name === "from" ? undefined : this.configuredTemplates[name];
        if (!base || typeof base !== "object") {
            throw new ApiError(ApiErrors.NOT_FOUND, 404, ApiErrorMessages.NOT_FOUND);
        }
        return resolveTemplate(base);
    }

    /**
     * The names of every template that can be edited: everything the config defines except `from`, which is the
     * sender address rather than a message.
     */
    public getTemplateNames(): string[] {
        return Object.keys(this.configuredTemplates).filter(
            (name) => name !== "from" && this.configuredTemplates[name] && typeof this.configuredTemplates[name] === "object",
        );
    }

    // -- Sending ---------------------------------------------------------------------------------------------------

    /**
     * Lays the admin's saved edits over the configured template (and the branding, via the send methods below), and
     * fills in the sender addresses from the saved settings, just before `MessagingUtils` reads it. A template the config doesn't define is left alone, so it fails the way it
     * always did.
     */
    override async loadTemplate(name: string): Promise<Template> {
        if (name !== "from" && this.configuredTemplates[name]) {
            const working = this.workingTemplates();
            const { from } = await this.settings.resolve();
            working.from = { email: from.email ?? "", sms: from.sms ?? "" };
            working[name] = mergeTemplate(
                await resolveTemplate(this.configuredTemplates[name]),
                await this.findOverride(name, true),
            );
        }
        return super.loadTemplate(name);
    }

    private async withBrand(templateVars: any): Promise<any> {
        return { brand: await this.loadBrand(), ...templateVars };
    }

    override async sendEmail(templateName: string, templateVars: any, options: any = {}): Promise<any> {
        await this.syncSmtp();
        return super.sendEmail(templateName, await this.withBrand(templateVars), options);
    }

    override async sendSMS(templateName: string, templateVars: any, options: any = {}): Promise<any> {
        await this.syncSms();
        return super.sendSMS(templateName, await this.withBrand(templateVars), options);
    }

    override async sendWhatsApp(templateName: string, templateVars: any, options: any = {}): Promise<any> {
        await this.syncWhatsApp();
        return super.sendWhatsApp(templateName, await this.withBrand(templateVars), options);
    }

    /**
     * Whether a WhatsApp message could be sent right now — the credentials are set, wherever they came from. Read
     * fresh each time, so it follows the admin console without a restart. `@rapidrest/auth`'s routes ask this before
     * offering WhatsApp as a way to receive a one-time code. Whether the message template a code goes out with is
     * one WhatsApp will deliver is a separate matter: see `Template.whatsapp_template`.
     */
    public async isWhatsAppConfigured(): Promise<boolean> {
        return (await this.settings.resolve()).whatsapp !== undefined;
    }

    // -- The transports --------------------------------------------------------------------------------------------

    /** Builds the nodemailer transport. A separate method so it's the one place nodemailer is loaded. */
    protected async createSmtpTransport(options: SmtpOptions): Promise<unknown> {
        const nodemailer = await import("nodemailer");
        return nodemailer.createTransport(options as any);
    }

    /** Builds the Twilio SDK client. A separate method so it's the one place the SDK is loaded. */
    protected async createTwilioClient(credentials: TwilioCredentials): Promise<unknown> {
        const twilio = await import("twilio");
        return twilio.default(credentials.accountSid, credentials.token, credentials.options as any);
    }

    /**
     * Makes `MessagingUtils`' SMTP transport the one for the settings in effect right now, building a new one only
     * when they've changed since the last e-mail. `MessagingUtils.init()` has already built one from `smtp_config`,
     * so that's the starting point rather than something to build again. A transport that can't be built is logged
     * and leaves e-mail unconfigured, which is what a send then reports.
     */
    private async syncSmtp(): Promise<void> {
        const self = this as any;
        if (this.smtpKey === undefined) {
            const configured = messagingFromConfig(this.configuredMessaging()).smtp;
            this.smtpKey = configured ? JSON.stringify(configured) : "";
        }
        const { smtp } = await this.settings.resolve();
        const key = smtp ? JSON.stringify(smtp) : "";
        if (key === this.smtpKey) {
            return;
        }
        this.smtpKey = key;
        try {
            self.smtpConfig = smtp ?? null;
            self._transporter = smtp ? await this.createSmtpTransport(smtp) : undefined;
        } catch (err) {
            this.warn("Unable to set up e-mail with the current settings", err);
            self.smtpConfig = null;
            self._transporter = undefined;
        }
    }

    /**
     * As `syncSmtp()`, for SMS: makes `MessagingUtils`' provider, and its Twilio client or Telnyx settings, the ones in
     * effect right now. `MessagingUtils.init()` has already set them up from `sms_config`, so that's the starting
     * point. One provider at a time: whichever isn't in use is cleared, so a send can only ever go through the chosen
     * one. With no provider configured a send reports that, as `MessagingUtils` does.
     */
    private async syncSms(): Promise<void> {
        const self = this as any;
        const keyOf = (sms: ResolvedSms | undefined) => (sms ? JSON.stringify(sms) : "");
        if (this.smsKey === undefined) {
            this.smsKey = keyOf(messagingFromConfig(this.configuredMessaging()).sms);
        }
        const { sms } = await this.settings.resolve();
        const key = keyOf(sms);
        if (key === this.smsKey) {
            return;
        }
        this.smsKey = key;
        try {
            self.twilio = sms?.provider === "twilio" ? await this.createTwilioClient(sms.config) : undefined;
            self.telnyx = sms?.provider === "telnyx" ? sms.config : undefined;
            self.smsConfig = sms ?? null;
        } catch (err) {
            this.warn("Unable to set up SMS with the current settings", err);
            self.twilio = undefined;
            self.telnyx = undefined;
            self.smsConfig = null;
        }
    }

    /** As `syncSms()`, for WhatsApp. There's no client to build — `MessagingUtils` sends over HTTP with these credentials — so they're just set. */
    private async syncWhatsApp(): Promise<void> {
        (this as any).whatsapp = (await this.settings.resolve()).whatsapp;
    }

    override async sendSlack(templateName: string, templateVars: any): Promise<any> {
        return super.sendSlack(templateName, await this.withBrand(templateVars));
    }

    // -- The admin console -----------------------------------------------------------------------------------------

    public async listTemplates(): Promise<MessageTemplateSummary[]> {
        const summaries: MessageTemplateSummary[] = [];
        for (const name of this.getTemplateNames()) {
            summaries.push(
                summarizeTemplate(name, await this.requireDefault(name), await this.findOverride(name, false)),
            );
        }
        return summaries;
    }

    public async getTemplate(name: string): Promise<MessageTemplateDetail> {
        const base = await this.requireDefault(name);
        return describeTemplate(name, base, await this.findOverride(name, false));
    }

    /**
     * Applies `changes` to the saved edits for `name` and stores them. A key that's left out is untouched, `null`
     * clears that part back to the default, and a string that matches the default exactly is stored as "no edit" so
     * that part keeps following the default if it ever changes. If nothing is left edited, the row is removed.
     * Refused with a 400 unless the result renders, so a broken template can never reach a real send.
     */
    public async updateTemplate(name: string, changes: MessageTemplateOverride): Promise<MessageTemplateDetail> {
        const base = await this.requireDefault(name);
        const repo = await this.getTemplateRepo();
        const existing = await this.findOverride(name, false);
        const next = this.applyChanges(base, existing, changes);

        await this.render(name, mergeTemplate(base, next));

        if (!isCustomized(next)) {
            if (existing) {
                await repo.delete(name, { ignoreACL: true, purge: true });
            }
            return describeTemplate(name, base, undefined);
        }
        const saved = existing
            ? await repo.update(new this.templateClass({ ...existing, ...next }), existing, { ignoreACL: true })
            : await repo.create({ uid: name, ...next }, { ignoreACL: true });
        return describeTemplate(name, base, saved);
    }

    /** The SMS settings as the admin console sees them — never including a token or API key. */
    public getSmsSettings(): Promise<SmsSettingsDTO> {
        return this.settings.getSms();
    }

    /**
     * Saves which SMS provider sends texts, that provider's credentials and the sender. A key that's left out is
     * untouched and `null` clears it. Secrets are encrypted before they're stored and are never returned — see
     * `SmsSettingsDTO`.
     */
    public updateSmsSettings(changes: SmsSettingsInput): Promise<SmsSettingsDTO> {
        return this.settings.updateSms(changes);
    }

    /** Puts the SMS provider, its credentials and the SMS sender back to what the deployment's config says, discarding what's saved. */
    public resetSmsSettings(): Promise<SmsSettingsDTO> {
        return this.settings.resetSms();
    }

    /** The WhatsApp settings as the admin console sees them — never including the access token. */
    public getWhatsAppSettings(): Promise<WhatsAppSettingsDTO> {
        return this.settings.getWhatsApp();
    }

    /** As `updateSmsSettings()`, for the WhatsApp phone number ID, access token and API version. */
    public updateWhatsAppSettings(changes: WhatsAppSettingsInput): Promise<WhatsAppSettingsDTO> {
        return this.settings.updateWhatsApp(changes);
    }

    /** As `resetSmsSettings()`, for the WhatsApp credentials. */
    public resetWhatsAppSettings(): Promise<WhatsAppSettingsDTO> {
        return this.settings.resetWhatsApp();
    }

    /** As `resetSmsSettings()`, for the SMTP server, its credentials and the e-mail sender. */
    public resetSmtpSettings(): Promise<SmtpSettingsDTO> {
        return this.settings.resetSmtp();
    }

    /** The SMTP settings as the admin console sees them — never including the password. */
    public getSmtpSettings(): Promise<SmtpSettingsDTO> {
        return this.settings.getSmtp();
    }

    /** As `updateSmsSettings()`, for the SMTP server and the sender address. */
    public updateSmtpSettings(changes: SmtpSettingsInput): Promise<SmtpSettingsDTO> {
        return this.settings.updateSmtp(changes);
    }

    /** Puts every part of `name` back to its default. */
    public async resetTemplate(name: string): Promise<MessageTemplateDetail> {
        const base = await this.requireDefault(name);
        if (await this.findOverride(name, false)) {
            const repo = await this.getTemplateRepo();
            await repo.delete(name, { ignoreACL: true, purge: true });
        }
        return describeTemplate(name, base, undefined);
    }

    /**
     * What `name` would render to with `candidate` laid over its default — with the real branding and a sample code
     * — without saving anything. Refused with a 400, like `updateTemplate()`, if it doesn't render.
     */
    public async previewTemplate(name: string, candidate: MessageTemplateOverride): Promise<RenderedMessage> {
        const base = await this.requireDefault(name);
        this.assertValid(candidate);
        return this.render(name, mergeTemplate(base, candidate));
    }

    private async render(name: string, template: DescribedTemplate): Promise<RenderedMessage> {
        try {
            return await renderTemplate(name, template, { totp: SAMPLE_CODE, brand: await this.loadBrand() });
        } catch (err) {
            throw new ApiError(
                ApiErrors.INVALID_REQUEST,
                400,
                `This template can't be rendered: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    private assertValid(changes: MessageTemplateOverride): void {
        if (changes.enabled != null && typeof changes.enabled !== "boolean") {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 400, "`enabled` must be true, false or null.");
        }
        for (const field of CONTENT_FIELDS) {
            const value = changes[field];
            if (value == null) {
                continue;
            }
            if (typeof value !== "string") {
                throw new ApiError(ApiErrors.INVALID_REQUEST, 400, `\`${field}\` must be a string or null.`);
            }
            if (value.length > MAX_FIELD_LENGTH) {
                throw new ApiError(ApiErrors.PAYLOAD_TOO_LARGE, 413, ApiErrorMessages.PAYLOAD_TOO_LARGE);
            }
        }
    }

    /** The saved edits after `changes` — see `updateTemplate()` for the rules. */
    private applyChanges(
        base: DescribedTemplate,
        existing: MessageTemplateOverride | undefined,
        changes: MessageTemplateOverride,
    ): MessageTemplateOverride {
        this.assertValid(changes ?? {});
        const next: MessageTemplateOverride = {
            enabled: existing?.enabled ?? null,
            ...Object.fromEntries(CONTENT_FIELDS.map((field) => [field, existing?.[field] ?? null])),
        };
        if (changes?.enabled !== undefined) {
            next.enabled = changes.enabled === base.enabled ? null : changes.enabled;
        }
        const defaults = contentOf(base);
        for (const field of CONTENT_FIELDS) {
            const value = changes?.[field];
            if (value !== undefined) {
                // An empty string where the default is unset says nothing, so it isn't stored as an edit.
                next[field] = value === (defaults[field] ?? "") ? null : value;
            }
        }
        return next;
    }
}
