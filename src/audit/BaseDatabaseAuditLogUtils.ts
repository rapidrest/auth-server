///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { AuditLogUtils, type AuditLogEntry } from "@rapidrest/auth";
import { BaseEntity, ObjectFactory, RepoUtils } from "@rapidrest/service-core";

/** The shape `AuditLogEntrySQL`/`AuditLogEntryMongo` share that this class depends on. */
export interface AuditLogEntryEntity extends BaseEntity {
    type: string;
    userUid?: string;
    actorUid?: string;
    ip?: string;
    path?: string;
    method?: string;
    /** `AuditLogEntrySQL` stores this JSON-serialized (a `string`); `AuditLogEntryMongo` stores it as a real nested object. */
    data?: unknown;
}

/**
 * The `AuditLogUtils` this server runs: the same class every `@rapidrest/auth` call site already injects (sign-ins,
 * MFA enrollment/removal, password changes, app-password lifecycle, elevation, impersonation, account deletion,
 * sessions-revoked, recovery-code use, ...), but backed by a real, durable, queryable table instead of the base
 * class's log-only `record()`.
 *
 * **Swapped in the same way `MessagingUtils` is** — registering it under the name `AuditLogUtils` (see
 * `src/sql/AuditLogUtils.ts`/`src/mongo/AuditLogUtils.ts`), which is how `ObjectFactory` finds the class every
 * `@Inject(AuditLogUtils)` in `@rapidrest/auth` asks for. Nothing in that library needs to know.
 *
 * **Written internally, `ignoreACL: true`, never through the generic ACL path.** `AuditLogEntrySQL`/
 * `AuditLogEntryMongo` are `@Protect()`ed deny-all, exactly like `MessagingSettingsSQL`/`Mongo` — the only way in is
 * `record()` below, and the only way to read one back is `BaseAuditLogRoute`'s trusted-role-gated endpoints.
 *
 * **A write failure is never swallowed here.** Per the agreed contract, a failure to persist an entry must not fail
 * the security-relevant action that triggered it (a login, a password change, ...) — but it also must not vanish
 * silently. `@rapidrest/auth`'s own call sites already `catch` around their `audit.record(...)` call and log loudly
 * on failure; this class's job is only to make sure a genuine failure actually reaches that `catch` by rejecting
 * normally, not to log-and-swallow it itself (which would just be a second, redundant place doing what the caller
 * already does, and would hide a `record()` bug from the very error-reporting path meant to catch it).
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseDatabaseAuditLogUtils extends AuditLogUtils {
    protected abstract entryClass: any;

    // Automatically injected by ObjectFactory on instantiation.
    protected _objectFactory?: ObjectFactory;

    private repoUtils?: RepoUtils<AuditLogEntryEntity>;

    private async repo(): Promise<RepoUtils<AuditLogEntryEntity>> {
        if (!this._objectFactory) {
            throw new Error("objectFactory is not set.");
        }
        if (!this.repoUtils) {
            this.repoUtils = await this._objectFactory.newInstance(RepoUtils, {
                name: this.entryClass.name,
                args: [this.entryClass],
            });
        }
        return this.repoUtils;
    }

    /**
     * How `entry.data` is stored: `AuditLogEntrySQL`'s `data` column is `text`, so the default here
     * JSON-serializes it. `src/mongo/AuditLogUtils.ts` overrides this to store the object as-is, since
     * `AuditLogEntryMongo`'s `data` is a real nested field. Returns `undefined` unchanged, and also for a value
     * that can't be serialized (e.g. holds a circular reference) rather than failing the whole write over
     * incidental extra context — the entry itself (`type`/`userUid`/...) is what matters most.
     */
    protected encodeData(data?: Record<string, unknown>): unknown {
        if (data === undefined) {
            return undefined;
        }
        try {
            return JSON.stringify(data);
        } catch {
            return undefined;
        }
    }

    /** Persists `entry` as a new, immutable row. Lets a genuine write failure reject normally — see the class doc comment. */
    public override async record(entry: AuditLogEntry): Promise<void> {
        const repo = await this.repo();
        await repo.create(
            {
                type: entry.type,
                userUid: entry.userUid,
                actorUid: entry.actorUid,
                ip: entry.ip,
                path: entry.path,
                method: entry.method,
                data: this.encodeData(entry.data),
            },
            { ignoreACL: true },
        );
    }
}
