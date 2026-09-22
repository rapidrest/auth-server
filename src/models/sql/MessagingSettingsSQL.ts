///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";

const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Nullable } = ObjectDecorators;
const { Column, Entity } = PersistenceDecorators;

/**
 * How this deployment sends e-mail, SMS and WhatsApp messages — the SMTP server, the SMS provider's (Twilio or Telnyx)
 * credentials, the WhatsApp credentials and the address/number each comes
 * from — editable through the admin console (see `BaseSmtpSettingsRoute`/`BaseSmsSettingsRoute`/
 * `BaseWhatsAppSettingsRoute`) so they can be changed or rotated without a redeploy. The deployment's config seeds it the first time it's read, and from then on
 * it's the source of truth (see `MessagingSettingsStore`). A singleton — always read/written under
 * `MESSAGING_SETTINGS_UID` — like `SiteSettingsSQL`, and kept apart from it because that row is served to anonymous
 * visitors and this one holds a secret.
 *
 * `twilioToken`, `telnyxApiKey`, `whatsappAccessToken` and `smtpPassword` are never stored as given: they're the `enc:v1:` AES-256-GCM envelope `SecretBox`
 * produces, under `auth:oauth_server:keys:encryption_key`, and are never returned by any endpoint — the admin console
 * only learns that one is set.
 *
 * If MongoDB is desired, please use `models.mongo.MessagingSettingsMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("Deployment-wide messaging credentials, set through the admin console.")
@Protect(
    {
        uid: "MessagingSettings",
        records: [
            {
                userOrRoleId: ".*",
                actions: [],
            },
        ],
    },
    false,
)
export class MessagingSettingsSQL extends BaseEntity {
    /** Which SMS provider sends texts (`twilio` or `telnyx`). `null` means whichever has credentials. */
    @Column({ nullable: true })
    @Nullable
    public smsProvider?: string;

    /** The Twilio Account SID (`AC` followed by 32 hex digits). Not a secret on its own, unlike the token. */
    @Column({ nullable: true })
    @Nullable
    public twilioAccountSid?: string;

    /** The Twilio auth token, as a `SecretBox` envelope. Never the plaintext. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public twilioToken?: string;

    /** The Telnyx API key, as a `SecretBox` envelope. Never the plaintext. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public telnyxApiKey?: string;

    /** The Telnyx messaging profile texts are sent through. Optional: Telnyx otherwise uses the sender number's own. */
    @Column({ nullable: true })
    @Nullable
    public telnyxMessagingProfileId?: string;

    /** The phone number (or alphanumeric sender ID) texts come from, whichever provider sends them. */
    @Column({ nullable: true })
    @Nullable
    public fromSms?: string;

    @Column({ nullable: true })
    @Nullable
    public smtpHost?: string;

    @Column({ nullable: true })
    @Nullable
    public smtpPort?: number;

    @Column({ nullable: true })
    @Nullable
    public smtpSecure?: boolean;

    @Column({ nullable: true })
    @Nullable
    public smtpUser?: string;

    /** The SMTP password, as a `SecretBox` envelope. Never the plaintext. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public smtpPassword?: string;

    /** The address e-mails come from. */
    @Column({ nullable: true })
    @Nullable
    public fromEmail?: string;

    /** Meta's ID for the WhatsApp Business phone number messages are sent from (not the number itself). */
    @Column({ nullable: true })
    @Nullable
    public whatsappPhoneNumberId?: string;

    /** The WhatsApp Business Cloud API access token, as a `SecretBox` envelope. Never the plaintext. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public whatsappAccessToken?: string;

    /** The Graph API version WhatsApp requests use, like `v23.0`. `null` uses the library's default. */
    @Column({ nullable: true })
    @Nullable
    public whatsappApiVersion?: string;

    /** Set once the row has been filled from the deployment's config; see `MessagingSettingsStore`. */
    @Column({ nullable: true })
    @Nullable
    public seeded?: boolean;

    constructor(other?: Partial<MessagingSettingsSQL>) {
        super(other);

        if (other) {
            this.smsProvider = other.smsProvider !== undefined ? other.smsProvider : this.smsProvider;
            this.telnyxApiKey = other.telnyxApiKey !== undefined ? other.telnyxApiKey : this.telnyxApiKey;
            this.telnyxMessagingProfileId =
                other.telnyxMessagingProfileId !== undefined ? other.telnyxMessagingProfileId : this.telnyxMessagingProfileId;
            this.whatsappPhoneNumberId =
                other.whatsappPhoneNumberId !== undefined ? other.whatsappPhoneNumberId : this.whatsappPhoneNumberId;
            this.whatsappAccessToken =
                other.whatsappAccessToken !== undefined ? other.whatsappAccessToken : this.whatsappAccessToken;
            this.whatsappApiVersion =
                other.whatsappApiVersion !== undefined ? other.whatsappApiVersion : this.whatsappApiVersion;
            this.twilioAccountSid = other.twilioAccountSid !== undefined ? other.twilioAccountSid : this.twilioAccountSid;
            this.twilioToken = other.twilioToken !== undefined ? other.twilioToken : this.twilioToken;
            this.fromSms = other.fromSms !== undefined ? other.fromSms : this.fromSms;
            this.smtpHost = other.smtpHost !== undefined ? other.smtpHost : this.smtpHost;
            this.smtpPort = other.smtpPort !== undefined ? other.smtpPort : this.smtpPort;
            this.smtpSecure = other.smtpSecure !== undefined ? other.smtpSecure : this.smtpSecure;
            this.smtpUser = other.smtpUser !== undefined ? other.smtpUser : this.smtpUser;
            this.smtpPassword = other.smtpPassword !== undefined ? other.smtpPassword : this.smtpPassword;
            this.fromEmail = other.fromEmail !== undefined ? other.fromEmail : this.fromEmail;
            this.seeded = other.seeded !== undefined ? other.seeded : this.seeded;
        }
    }
}
