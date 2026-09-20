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
 * An admin's edits to one of the e-mail/SMS templates this server sends (see `DEFAULT_MESSAGE_TEMPLATES`), edited
 * through the admin console (see `BaseMessageTemplateRoute`) so a wording change doesn't need a redeploy.
 *
 * One row per template, with its `uid` set to the template's name (`login-otp`, `register-otp`, …) — the same
 * fixed-uid convention `SiteSettingsSQL` uses, so a template is always found by a direct lookup. Every field is
 * an *override*: `null` means "use the default from config", so a template that has only had its subject edited
 * still picks up later changes to the shipped body, and deleting the row puts the whole template back to its
 * default. `MessagingUtils` merges these over the config defaults on every send (see
 * `BaseDatabaseMessagingUtils`).
 *
 * If MongoDB is desired, please use `models.mongo.MessageTemplateMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("An admin's edits to one of the e-mail/SMS message templates this server sends.")
@Protect(
    {
        uid: "MessageTemplate",
        records: [
            {
                userOrRoleId: ".*",
                actions: [],
            },
        ],
    },
    false,
)
export class MessageTemplateSQL extends BaseEntity {
    /** Overrides whether the template is sent at all. `null` uses the default. */
    @Column({ nullable: true })
    @Nullable
    public enabled?: boolean;

    /** Overrides the e-mail subject. `null` uses the default; an empty string stops the e-mail being sent. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public subject?: string;

    /** Overrides the plain-text e-mail body. `null` uses the default. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public text?: string;

    /** Overrides the HTML e-mail body. `null` uses the default; an empty string sends the e-mail as plain text only. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public html?: string;

    /** Overrides the SMS body. `null` uses the default; an empty string stops the SMS being sent. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public sms?: string;

    constructor(other?: Partial<MessageTemplateSQL>) {
        super(other);

        if (other) {
            this.enabled = other.enabled !== undefined ? other.enabled : this.enabled;
            this.subject = other.subject !== undefined ? other.subject : this.subject;
            this.text = other.text !== undefined ? other.text : this.text;
            this.html = other.html !== undefined ? other.html : this.html;
            this.sms = other.sms !== undefined ? other.sms : this.sms;
        }
    }
}
