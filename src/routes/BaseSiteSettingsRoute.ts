///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, ObjectDecorators } from "@rapidrest/core";
import {
    ApiErrorMessages,
    ApiErrors,
    BaseEntity,
    DocDecorators,
    HttpRequest,
    HttpResponse,
    ObjectFactory,
    RepoUtils,
    RouteDecorators,
} from "@rapidrest/service-core";

const { Init } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Delete, Get, Post, Put, RateLimit, Request, RequiresTrustedRole, Response } = RouteDecorators;

/** The fixed `uid` the single settings row is always read/written under (re-exported by `SiteSettingsSQL`/`SiteSettingsMongo` for their own doc comments). */
export const SITE_SETTINGS_UID = "default";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_STYLESHEET_BYTES = 512 * 1024;
const ALLOWED_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"];

/** The shape shared by `SiteSettingsSQL`/`SiteSettingsMongo` that this route depends on. */
export interface SiteSettingsEntity extends BaseEntity {
    siteTitle?: string;
    companyName?: string;
    headerHtml?: string;
    footerHtml?: string;
    logoUrl?: string;
    logoData?: string;
    logoContentType?: string;
    stylesheetUrl?: string;
    stylesheetCss?: string;
}

/** The branding fields returned to (and consumed by) `apps/www`/`apps/admin` — never includes raw uploaded bytes. */
export interface PublicSiteSettings {
    siteTitle?: string;
    companyName?: string;
    headerHtml?: string;
    footerHtml?: string;
    /** The raw configured reference URL, if any — not resolved against an uploaded asset. */
    logoUrl?: string;
    /** `true` when a logo was uploaded directly; consumers should prefer `GET .../logo` over `logoUrl` in that case. */
    logoUploaded: boolean;
    /** The raw configured reference URL, if any — not resolved against an uploaded asset. */
    stylesheetUrl?: string;
    /** `true` when a stylesheet was uploaded directly; consumers should prefer `GET .../stylesheet` over `stylesheetUrl` in that case. */
    stylesheetUploaded: boolean;
}

export interface UpdateSiteSettingsInput {
    /** Omit to leave untouched; `null` clears the field. */
    siteTitle?: string | null;
    companyName?: string | null;
    headerHtml?: string | null;
    footerHtml?: string | null;
    logoUrl?: string | null;
    stylesheetUrl?: string | null;
}

/**
 * Deployment-wide branding for `apps/www` and `apps/admin` — site title, company name, header/footer
 * content, and a logo/stylesheet supplied either as an external reference URL or a directly uploaded
 * asset. Read (`GET`) is public and unauthenticated (both console apps, including anonymous `www`
 * visitors, need it to render their own chrome); every write requires the `admin` trusted role via
 * `@RequiresTrustedRole()`, the same convention `BaseImpersonationRoute`/`BaseOAuthClientRoute` use.
 *
 * Deliberately does **not** extend `ModelRoute`/`CRUDRoute`: those attach an automatic per-request ACL
 * check driven by the model's class-level `@Protect()` ACL, layered *in addition to* (not instead of)
 * any `@RequiresTrustedRole()`/`ignoreACL` scheme a route also applies — fine for a self-service
 * resource like `Client`, but wrong here, where authorization is meant to be decided entirely by
 * `@RequiresTrustedRole()` plus a fully public `GET`. `BaseImpersonationRoute` (also public-read /
 * trusted-write, also with no natural per-record ACL) sidesteps this the same way: it's a plain class
 * that constructs its own `RepoUtils` directly via `ObjectFactory`, and always calls it with
 * `ignoreACL: true`. `SiteSettingsSQL`/`SiteSettingsMongo`'s own `@Protect()` is set deny-all
 * accordingly — nothing should ever reach it through the generic ACL path.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseSiteSettingsRoute<T extends SiteSettingsEntity> {
    protected abstract settingsClass: any;

    // Automatically injected by ObjectFactory on instantiation.
    private _objectFactory?: ObjectFactory;

    protected repoUtils?: RepoUtils<T>;

    @Init
    protected async initialize(): Promise<void> {
        if (!this._objectFactory) {
            throw new Error("objectFactory is not set.");
        }
        if (!this.repoUtils) {
            this.repoUtils = await this._objectFactory.newInstance(RepoUtils, {
                name: this.settingsClass.name,
                args: [this.settingsClass],
            });
        }
    }

    /**
     * Fetches the single settings row, creating it with all-default fields on first access. Tolerates
     * two concurrent first-requests racing to create it: the loser's `IDENTIFIER_EXISTS` is swallowed
     * and the now-existing row is re-fetched instead of failing the request.
     */
    protected async getOrCreate(): Promise<T> {
        if (!this.repoUtils) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        const existing = await this.repoUtils.findOne(SITE_SETTINGS_UID, { ignoreACL: true });
        if (existing) {
            return existing;
        }
        try {
            return await this.repoUtils.create({ uid: SITE_SETTINGS_UID } as Partial<T>, { ignoreACL: true });
        } catch (err) {
            if (err instanceof ApiError && err.code === ApiErrors.IDENTIFIER_EXISTS) {
                const recovered = await this.repoUtils.findOne(SITE_SETTINGS_UID, { ignoreACL: true });
                if (recovered) {
                    return recovered;
                }
            }
            throw err;
        }
    }

    protected toPublicDTO(entity: T): PublicSiteSettings {
        return {
            siteTitle: entity.siteTitle ?? undefined,
            companyName: entity.companyName ?? undefined,
            headerHtml: entity.headerHtml ?? undefined,
            footerHtml: entity.footerHtml ?? undefined,
            logoUrl: entity.logoUrl ?? undefined,
            logoUploaded: !!entity.logoData,
            stylesheetUrl: entity.stylesheetUrl ?? undefined,
            stylesheetUploaded: !!entity.stylesheetCss,
        };
    }

    /**
     * Applies a partial update (an omitted key stays untouched; `null` clears it) and persists it.
     * `null`, not `undefined`, is the "clear" sentinel here on purpose: `RepoUtils.update()`'s
     * underlying TypeORM `Repository.update()` call silently drops any key whose value is `undefined`
     * from the generated `SET` clause (treating it the same as "not provided" — the whole point of
     * *omitted* keys in `UpdateSiteSettingsInput` staying untouched), so only a real SQL `NULL` — i.e.
     * a JS `null` — actually clears a column.
     */
    private async applyUpdate(changes: Record<string, string | null | undefined>): Promise<PublicSiteSettings> {
        if (!this.repoUtils) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        const existing = await this.getOrCreate();
        const merged = new this.settingsClass({ ...existing, ...changes });
        const updated = await this.repoUtils.update(merged, existing, { ignoreACL: true });
        return this.toPublicDTO(updated);
    }

    private static headerValue(req: HttpRequest, name: string): string | undefined {
        const value = req.headers[name];
        return Array.isArray(value) ? value[0] : value;
    }

    @Summary("Get site customization settings")
    @Description(
        "Public, unauthenticated. Returns this deployment's branding for `apps/www`/`apps/admin` to render: " +
            "site title, company name, header/footer content, and the configured logo/stylesheet reference " +
            "(plus whether each was instead directly uploaded, in which case `GET .../logo`/`GET .../stylesheet` " +
            "should be used as the source instead of the `logoUrl`/`stylesheetUrl` fields).",
    )
    @Returns([Object])
    @Get()
    @RateLimit()
    public async getSettings(): Promise<PublicSiteSettings> {
        return this.toPublicDTO(await this.getOrCreate());
    }

    @Summary("Update site customization settings")
    @Description(
        "Trusted-role-only. Partially updates the deployment's branding text fields and/or logo/stylesheet " +
            "reference URLs. An omitted key leaves the field untouched; an explicit `null` clears it.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put()
    @RequiresTrustedRole()
    @RateLimit()
    public async updateSettings(body: UpdateSiteSettingsInput): Promise<PublicSiteSettings> {
        const changes: Record<string, string | null | undefined> = {};
        if (body?.siteTitle !== undefined) changes.siteTitle = body.siteTitle;
        if (body?.companyName !== undefined) changes.companyName = body.companyName;
        if (body?.headerHtml !== undefined) changes.headerHtml = body.headerHtml;
        if (body?.footerHtml !== undefined) changes.footerHtml = body.footerHtml;
        if (body?.logoUrl !== undefined) changes.logoUrl = body.logoUrl;
        if (body?.stylesheetUrl !== undefined) changes.stylesheetUrl = body.stylesheetUrl;
        return this.applyUpdate(changes);
    }

    @Summary("Upload a logo image")
    @Description(
        "Trusted-role-only. The request body is the raw image bytes (`Content-Type` must be one of " +
            ALLOWED_LOGO_CONTENT_TYPES.join(", ") +
            `, max ${MAX_LOGO_BYTES} bytes). Once uploaded, ` +
            "`GET .../logo` serves it and it takes precedence over any configured `logoUrl`.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/logo")
    @RequiresTrustedRole()
    @RateLimit()
    public async uploadLogo(@Request req: HttpRequest): Promise<PublicSiteSettings> {
        const contentType = BaseSiteSettingsRoute.headerValue(req, "content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase();
        if (!contentType || !ALLOWED_LOGO_CONTENT_TYPES.includes(contentType)) {
            throw new ApiError(
                ApiErrors.INVALID_REQUEST,
                400,
                `Unsupported logo content type. Allowed: ${ALLOWED_LOGO_CONTENT_TYPES.join(", ")}.`,
            );
        }
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 400, ApiErrorMessages.INVALID_REQUEST);
        }
        if (body.length > MAX_LOGO_BYTES) {
            throw new ApiError(ApiErrors.PAYLOAD_TOO_LARGE, 413, ApiErrorMessages.PAYLOAD_TOO_LARGE);
        }

        return this.applyUpdate({ logoData: body.toString("base64"), logoContentType: contentType });
    }

    @Summary("Remove the uploaded logo image")
    @Description("Trusted-role-only. Clears any directly uploaded logo, reverting to `logoUrl` (if configured).")
    @Returns([Object])
    @Auth(["jwt"])
    @Delete("/logo")
    @RequiresTrustedRole()
    @RateLimit()
    public async deleteLogo(): Promise<PublicSiteSettings> {
        return this.applyUpdate({ logoData: null, logoContentType: null });
    }

    @Summary("Fetch the uploaded logo image")
    @Description("Public, unauthenticated. 404s when no logo has been directly uploaded.")
    @Get("/logo")
    @RateLimit()
    public async getLogo(@Response res: HttpResponse): Promise<void> {
        const existing = await this.getOrCreate();
        if (!existing.logoData || !existing.logoContentType) {
            res.status(404).end();
            return;
        }
        res.setHeader("content-type", existing.logoContentType);
        res.setHeader("cache-control", "public, max-age=300");
        res.end(Buffer.from(existing.logoData, "base64"));
    }

    @Summary("Upload a custom stylesheet")
    @Description(
        "Trusted-role-only. The request body is the raw CSS text " +
            `(max ${MAX_STYLESHEET_BYTES} bytes). Once uploaded, ` +
            "`GET .../stylesheet` serves it and it takes precedence over any configured `stylesheetUrl`.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/stylesheet")
    @RequiresTrustedRole()
    @RateLimit()
    public async uploadStylesheet(@Request req: HttpRequest): Promise<PublicSiteSettings> {
        const body = req.body;
        const raw = Buffer.isBuffer(body) ? body : typeof body === "string" ? Buffer.from(body, "utf8") : null;
        if (!raw || raw.length === 0) {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 400, ApiErrorMessages.INVALID_REQUEST);
        }
        if (raw.length > MAX_STYLESHEET_BYTES) {
            throw new ApiError(ApiErrors.PAYLOAD_TOO_LARGE, 413, ApiErrorMessages.PAYLOAD_TOO_LARGE);
        }

        return this.applyUpdate({ stylesheetCss: raw.toString("utf8") });
    }

    @Summary("Remove the uploaded stylesheet")
    @Description("Trusted-role-only. Clears any directly uploaded stylesheet, reverting to `stylesheetUrl` (if configured).")
    @Returns([Object])
    @Auth(["jwt"])
    @Delete("/stylesheet")
    @RequiresTrustedRole()
    @RateLimit()
    public async deleteStylesheet(): Promise<PublicSiteSettings> {
        return this.applyUpdate({ stylesheetCss: null });
    }

    @Summary("Fetch the uploaded stylesheet")
    @Description("Public, unauthenticated. 404s when no stylesheet has been directly uploaded.")
    @Get("/stylesheet")
    @RateLimit()
    public async getStylesheet(@Response res: HttpResponse): Promise<void> {
        const existing = await this.getOrCreate();
        if (!existing.stylesheetCss) {
            res.status(404).end();
            return;
        }
        res.setHeader("content-type", "text/css");
        res.setHeader("cache-control", "public, max-age=300");
        res.end(Buffer.from(existing.stylesheetCss, "utf8"));
    }
}
