///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, ObjectDecorators, type JWTUser } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, ObjectFactory, RepoUtils, RouteDecorators } from "@rapidrest/service-core";
import { type AuditLogEntryEntity } from "../audit/BaseDatabaseAuditLogUtils.js";
import { toAuditLogEntryDTO, type AuditLogEntryDTO } from "../audit/AuditLogEntries.js";

const { Init, Logger } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, Param, Query, RateLimit, RequiresTrustedRole, User } = RouteDecorators;

/**
 * Admin-console/API access to the durable audit log `BaseDatabaseAuditLogUtils.record()` writes: list it
 * (paginated, filterable) and read a single entry. Every endpoint requires the `admin` trusted role via
 * `@RequiresTrustedRole()` — the same convention `BaseSiteSettingsRoute`'s writes and `BaseMessageTemplateRoute`
 * use, here applied to reads too, since a security audit trail is exactly the kind of thing that must never be
 * handed to an unprivileged (or anonymous) caller.
 *
 * **Read-only, deliberately.** There is no `POST`/`PUT`/`DELETE` here at all — an entry is written only internally
 * by `BaseDatabaseAuditLogUtils.record()`, and the log is append-only (see that class, and `AuditLogEntrySQL`'s own
 * doc comment): nothing about this route ever creates, edits or removes a row. The only thing that may ever remove
 * one is age alone, via the optional `BaseAuditLogRetentionJob` — never a client request.
 *
 * Like `BaseSiteSettingsRoute`/`BaseMessageTemplateRoute`, deliberately not a `ModelRoute`/`CRUDRoute`: those bring
 * an automatic per-request ACL check layered on top of whatever a route applies of its own, which is wrong here —
 * `AuditLogEntrySQL`/`AuditLogEntryMongo` are `@Protect()`ed deny-all on purpose, and authorization is meant to be
 * decided entirely by `@RequiresTrustedRole()`. This class constructs its own `RepoUtils` directly via
 * `ObjectFactory`, the same way `BaseSiteSettingsRoute` does, and always reads with `ignoreACL: true`.
 *
 * **Filtering, pagination and sorting reuse this app's existing query-operator convention** — the same one
 * `BaseUserRoute`'s `GET /users` already exposes (see `apps/shared/lib/adminApi.ts`'s `buildUsersQuery()`), because
 * this route hands the request's query string straight to `RepoUtils.find()`, which parses it via
 * `ModelUtils.buildSearchQuery()`: `field=eq(value)`, `field=in(a,b,c)`, `field=like(pattern)`, `field=gte(value)`/
 * `field=lte(value)`, `field=range(lo,hi)` (handy for a `dateCreated` window), plus `page`/`limit`. `sort` defaults
 * to `-dateCreated` (newest first) when the caller doesn't supply one — `-` is this framework's existing
 * descending-sort convention (see `ModelUtils.buildSearchQuery()`'s own doc comment).
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseAuditLogRoute {
    protected abstract entryClass: any;

    // Automatically injected by ObjectFactory on instantiation.
    private _objectFactory?: ObjectFactory;

    protected repoUtils?: RepoUtils<AuditLogEntryEntity>;

    @Logger
    protected logger?: any;

    @Init
    protected async initialize(): Promise<void> {
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

    private repo(): RepoUtils<AuditLogEntryEntity> {
        if (!this.repoUtils) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        return this.repoUtils;
    }

    @Summary("List audit log entries")
    @Description(
        "Trusted-role-only. Paginated, newest-first by default (`sort=-dateCreated`). Accepts the same " +
            "filter-operator query syntax as every other list endpoint in this app, e.g. `userUid=eq(...)`, " +
            "`type=eq(...)` or `type=in(a,b)`, `dateCreated=range(lo,hi)`, plus `page`/`limit`/`sort`.",
    )
    @Returns([[Array, Object]])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async list(@Query() query: Record<string, unknown> = {}, @User user: JWTUser): Promise<AuditLogEntryDTO[]> {
        const q: Record<string, unknown> = { ...(query ?? {}) };
        if (q.sort === undefined || q.sort === null || q.sort === "") {
            q.sort = "-dateCreated";
        }
        const results = await this.repo().find(q, {
            limit: (query as any)?.limit,
            page: (query as any)?.page,
            user,
            ignoreACL: true,
        });
        return results.map((entry) => toAuditLogEntryDTO(entry));
    }

    @Summary("Get an audit log entry")
    @Description("Trusted-role-only. A single audit log entry by its `uid`.")
    @Returns([Object])
    @Auth(["jwt"])
    @Get("/:id")
    @RequiresTrustedRole()
    @RateLimit()
    public async get(@Param("id") id: string, @User user: JWTUser): Promise<AuditLogEntryDTO> {
        const entry = await this.repo().findOne(id, { ignoreACL: true, user });
        if (!entry) {
            throw new ApiError(ApiErrors.NOT_FOUND, 404, ApiErrorMessages.NOT_FOUND);
        }
        return toAuditLogEntryDTO(entry);
    }
}
