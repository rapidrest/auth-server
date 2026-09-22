///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ObjectDecorators } from "@rapidrest/core";
import { BackgroundService, ObjectFactory, RepoUtils } from "@rapidrest/service-core";
import { type AuditLogEntryEntity } from "./BaseDatabaseAuditLogUtils.js";

const { Config, Logger } = ObjectDecorators;

/**
 * Optional, small, daily background job that purges audit log entries older than a configured window. Runs once
 * a day (see `schedule`) for every deployment, but **only ever deletes anything when `audit_log:retention_days` is
 * explicitly configured** — the schedule firing is not itself the opt-in; `run()` is, via the guard at its top.
 * Unset/`null` (the default — see `config.sql.ts`/`config.mongo.ts`) means "keep every entry forever", and that's
 * exactly what happens: `run()` returns immediately without touching the table. Unexpected data loss in an audit
 * trail would be a serious regression, so there's deliberately no other way to enable purging.
 *
 * Reuses `RepoUtils.truncate()` — the same permanent, `ignoreACL: true` bulk-delete `BaseSiteSettingsRoute`-style
 * code already relies on elsewhere in this app — with a `dateCreated=lte(cutoff)` filter, rather than hand-rolling
 * a delete query. A failure to purge is logged and left for the next scheduled run; it never throws out of `run()`
 * (an uncaught `run()` would just be logged and retried by `BackgroundServiceManager` anyway, but there's nothing
 * to gain by not handling it here explicitly, and it keeps the "never fails the process" behavior obvious locally).
 *
 * Discovered by `ClassLoader` the same way every other class under `src/sql`/`src/mongo` is (see
 * `src/sql/AuditLogUtils.ts`'s own doc comment on that mechanism) — no separate registration needed.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseAuditLogRetentionJob extends BackgroundService {
    protected abstract entryClass: any;

    // Automatically injected by ObjectFactory on instantiation.
    private _objectFactory?: ObjectFactory;

    private repoUtils?: RepoUtils<AuditLogEntryEntity>;

    /** Unset/`null` (the default) means never purge. A configured value is the number of days an entry is kept. */
    @Config("audit_log:retention_days", null)
    protected retentionDays: number | null = null;

    @Logger
    protected logger?: any;

    /** Once a day, at 03:00 server time — comfortably off any peak traffic window, and frequent enough that a configured retention window is honored promptly. */
    public get schedule(): string | undefined {
        return "0 3 * * *";
    }

    /** Sets up this job's repository. Called once by `BackgroundServiceManager` before the daily schedule begins. */
    public async start(): Promise<void> {
        if (!this._objectFactory) {
            throw new Error("objectFactory is not set.");
        }
        if (!this.repoUtils) {
            this.repoUtils = await this._objectFactory.newInstance(RepoUtils, {
                name: this.entryClass.name,
                args: [this.entryClass],
            });
        }
    }

    public async run(): Promise<void> {
        const days = this.retentionDays;
        // Strictly opt-in: no configured (positive) window means never purge anything, ever.
        if (days === null || days === undefined || !(Number(days) > 0)) {
            return;
        }
        if (!this.repoUtils) {
            return;
        }
        const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
        try {
            await this.repoUtils.truncate({ dateCreated: `lte(${cutoff.toISOString()})` }, { ignoreACL: true });
        } catch (err) {
            this.logger?.warn?.(
                `Failed to purge audit log entries older than ${days} day(s): ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    public stop(): void {
        // Nothing to clean up.
    }
}
