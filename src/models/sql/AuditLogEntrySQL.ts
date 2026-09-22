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
 * One durable, queryable record of a security-relevant event — a sign-in, an MFA enrollment/removal, a password
 * change, an app-password created/removed/used, an elevation, an impersonation, an account deletion, a
 * sessions-revoked, a recovery-code use, and so on. Written internally by `BaseDatabaseAuditLogUtils.record()`
 * (see that class) every time `@rapidrest/auth` calls its injected `AuditLogUtils.record()` — never by a client
 * request. Read only through `BaseAuditLogRoute`'s trusted-role-gated `GET` endpoints.
 *
 * **Append-only.** A row is written once and never updated or deleted through the API — the only thing that may
 * ever remove one is a future, purely age-based retention job (see `BaseAuditLogRetentionJob`), never an edit.
 * `BaseEntity`'s own `dateCreated` *is* the event's timestamp; there's no separate field for it.
 *
 * `data` holds whatever extra structured context a call site attached (`secretUid`, `secretType`, `scopes`, ...).
 * SQL has no portable JSON column type across every datastore this app might run on, so it's stored as `text`,
 * JSON-serialized on write and parsed back into a real object when a route hands it to a client — see
 * `BaseAuditLogRoute.toDTO()`. A value that isn't serializable, or that fails to parse back (shouldn't happen for
 * anything this class itself wrote), is treated as absent rather than failing the read.
 *
 * Same deny-all `@Protect()` as `MessagingSettingsSQL`: nothing should ever reach this model through the generic
 * per-record ACL path. Every write goes through `RepoUtils.create()` with `ignoreACL: true`; every read goes
 * through `BaseAuditLogRoute`, gated by `@RequiresTrustedRole()` instead of this model's own ACL.
 *
 * If MongoDB is desired, please use `models.mongo.AuditLogEntryMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
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
export class AuditLogEntrySQL extends BaseEntity {
    /** A stable identifier for what happened, e.g. `"auth.signed_in"`, `"auth.impersonated"`, `"auth.elevated"`. Always present. */
    @Column()
    @Description("A stable identifier for what happened, e.g. `auth.signed_in`, `auth.impersonated`, `auth.elevated`.")
    public type: string = "";

    /** The account the entry is about. */
    @Column({ nullable: true })
    @Nullable
    public userUid?: string;

    /** Who performed the action, only set when different from `userUid` (an admin impersonating/deleting/revoking sessions for someone else). */
    @Column({ nullable: true })
    @Nullable
    public actorUid?: string;

    /** The caller's IP address, if known. */
    @Column({ nullable: true })
    @Nullable
    public ip?: string;

    /** The request path the event occurred on, if known. */
    @Column({ nullable: true })
    @Nullable
    public path?: string;

    /** e.g. the auth method for a `signed_in` entry: `"password"`, `"app-password"`, `"mfa"`, `"passkey"`, `"fido2"`, `"totp"`, `"otp"`, `"oidc:google"`, ... */
    @Column({ nullable: true })
    @Nullable
    public method?: string;

    /** Extra structured context (`secretUid`, `secretType`, `scopes`, ...), stored JSON-serialized. See the class doc comment. */
    @Column({ type: "text", nullable: true })
    @Nullable
    public data?: string;

    constructor(other?: Partial<AuditLogEntrySQL>) {
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
