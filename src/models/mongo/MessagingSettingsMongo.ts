///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseMongoEntity, DocDecorators, ModelDecorators, PersistenceDecorators } from "@rapidrest/service-core";
import { ObjectDecorators } from "@rapidrest/core";

const { Description } = DocDecorators;
const { DataStore, Protect } = ModelDecorators;
const { Nullable } = ObjectDecorators;
const { Column, Entity } = PersistenceDecorators;

/**
 * Implementation of `MessagingSettingsSQL`'s shape for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.MessagingSettingsSQL` instead. See that class for field documentation.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
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
export class MessagingSettingsMongo extends BaseMongoEntity {
    @Column()
    @Nullable
    public smsProvider?: string;

    @Column()
    @Nullable
    public twilioAccountSid?: string;

    @Column()
    @Nullable
    public twilioToken?: string;

    @Column()
    @Nullable
    public telnyxApiKey?: string;

    @Column()
    @Nullable
    public telnyxMessagingProfileId?: string;

    @Column()
    @Nullable
    public fromSms?: string;

    @Column()
    @Nullable
    public whatsappPhoneNumberId?: string;

    @Column()
    @Nullable
    public whatsappAccessToken?: string;

    @Column()
    @Nullable
    public whatsappApiVersion?: string;

    @Column()
    @Nullable
    public smtpHost?: string;

    @Column()
    @Nullable
    public smtpPort?: number;

    @Column()
    @Nullable
    public smtpSecure?: boolean;

    @Column()
    @Nullable
    public smtpUser?: string;

    @Column()
    @Nullable
    public smtpPassword?: string;

    @Column()
    @Nullable
    public fromEmail?: string;

    @Column()
    @Nullable
    public seeded?: boolean;

    constructor(other?: Partial<MessagingSettingsMongo>) {
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
