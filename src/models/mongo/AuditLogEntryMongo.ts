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
 * Implementation of `AuditLogEntrySQL`'s shape for storage in a MongoDB database. If SQL is desired, please use
 * `models.sql.AuditLogEntrySQL` instead. See that class for field documentation.
 *
 * **`data` is stored as a real nested object here, not JSON text** — MongoDB has a native document type, so there's
 * no portability reason to flatten it the way the SQL model must. `BaseAuditLogRoute.toDTO()` normalizes both
 * storage shapes to the same `Record<string, unknown> | undefined` in the API response either way.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
@Entity()
@Description("A durable record of one security-relevant event, written internally and read only by trusted admins.")
@Protect(
    {
        uid: "AuditLogEntry",
        records: [
            {
                userOrRoleId: ".*",
                actions: [],
            },
        ],
    },
    false,
)
export class AuditLogEntryMongo extends BaseMongoEntity {
    @Column()
    public type: string = "";

    @Column()
    @Nullable
    public userUid?: string;

    @Column()
    @Nullable
    public actorUid?: string;

    @Column()
    @Nullable
    public ip?: string;

    @Column()
    @Nullable
    public path?: string;

    @Column()
    @Nullable
    public method?: string;

    /** Extra structured context, stored as a real nested object — see the class doc comment. */
    @Column()
    @Nullable
    public data?: Record<string, unknown>;

    constructor(other?: Partial<AuditLogEntryMongo>) {
        super(other);

        if (other) {
            this.type = other.type !== undefined ? other.type : this.type;
            this.userUid = other.userUid !== undefined ? other.userUid : this.userUid;
            this.actorUid = other.actorUid !== undefined ? other.actorUid : this.actorUid;
            this.ip = other.ip !== undefined ? other.ip : this.ip;
            this.path = other.path !== undefined ? other.path : this.path;
            this.method = other.method !== undefined ? other.method : this.method;
            this.data = other.data !== undefined ? other.data : this.data;
        }
    }
}
