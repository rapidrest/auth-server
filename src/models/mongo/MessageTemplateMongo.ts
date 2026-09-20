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
 * Implementation of `MessageTemplateSQL`'s shape for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.MessageTemplateSQL` instead. See that class for field documentation.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
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
export class MessageTemplateMongo extends BaseMongoEntity {
    @Column()
    @Nullable
    public enabled?: boolean;

    @Column()
    @Nullable
    public subject?: string;

    @Column()
    @Nullable
    public text?: string;

    @Column()
    @Nullable
    public html?: string;

    @Column()
    @Nullable
    public sms?: string;

    constructor(other?: Partial<MessageTemplateMongo>) {
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
