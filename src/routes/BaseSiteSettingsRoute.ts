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
import { SITE_SETTINGS_SEED_FIELDS, siteSettingsSeedFromConfig } from "./SiteSettingsSeed.js";

const { Config, Init, Logger } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Delete, Get, Post, Put, RateLimit, Request, RequiresTrustedRole, Response } = RouteDecorators;

/** The fixed `uid` the single settings row is always read/written under (re-exported by `SiteSettingsSQL`/`SiteSettingsMongo` for their own doc comments). */
export const SITE_SETTINGS_UID = "default";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_ICON_BYTES = 512 * 1024;
const MAX_STYLESHEET_BYTES = 512 * 1024;
const ALLOWED_IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"];

/** The shape shared by `SiteSettingsSQL`/`SiteSettingsMongo` that this route depends on. */
export interface SiteSettingsEntity extends BaseEntity {
    siteTitle?: string;
    companyName?: string;
    headerHtml?: string;
    footerHtml?: string;
    logoUrl?: string;
    logoData?: string;
    logoContentType?: string;
    iconUrl?: string;
    iconData?: string;
    iconContentType?: string;
    stylesheetUrl?: string;
    stylesheetCss?: string;
    /** Set once the row has been filled from the deployment's `site_settings` config, after which the row is the source of truth. Never public. */
    seeded?: boolean | null;
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
    /** The raw configured reference URL for the compact nav-header icon, if any — not resolved against an uploaded asset. */
    iconUrl?: string;
    /** `true` when an icon was uploaded directly; consumers should prefer `GET .../icon` over `iconUrl` in that case. */
    iconUploaded: boolean;
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
    iconUrl?: string | null;
    stylesheetUrl?: string | null;
}

/** Maps a `SiteSettingsEntity` to the `PublicSiteSettings` DTO — shared by `BaseSiteSettingsRoute.toPublicDTO()` and `readPublicSiteSettings()` below. */
function siteSettingsToPublicDTO(entity: SiteSettingsEntity): PublicSiteSettings {
    return {
        siteTitle: entity.siteTitle ?? undefined,
        companyName: entity.companyName ?? undefined,
        headerHtml: entity.headerHtml ?? undefined,
        footerHtml: entity.footerHtml ?? undefined,
        logoUrl: entity.logoUrl ?? undefined,
        logoUploaded: !!entity.logoData,
        iconUrl: entity.iconUrl ?? undefined,
        iconUploaded: !!entity.iconData,
        stylesheetUrl: entity.stylesheetUrl ?? undefined,
        stylesheetUploaded: !!entity.stylesheetCss,
    };
}

/** Whether a saved field still has nothing in it, and so is free for config to fill. */
function isEmptyField(value: unknown): boolean {
    return value === null || value === undefined || value === "";
}

/**
 * The one place the singleton settings row is fetched, and created if it's missing — shared by
 * `BaseSiteSettingsRoute`, `readPublicSiteSettings()` (so `wwwRoute`, `AdminConsoleRoute` and the messaging
 * branding) and anything else that reads it, so the deployment's config seeds it whichever of them runs first.
 *
 * **The deployment's `site_settings` config seeds the row once, then the row is the source of truth** — the same
 * model as the messaging settings (`MessagingSettingsStore`). The first time the row is read it's created with, or
 * (for a row saved before seeding existed, with `seeded` unset) given, the configured value of every field that's
 * still empty, and marked `seeded`. Anything already saved is left alone, and once seeded config is never consulted
 * again: an admin who clears a field really clears it, and changing config later doesn't overwrite their edits.
 * A blank or invalid configured value seeds nothing (see `siteSettingsSeedFromConfig()`).
 *
 * Tolerates two instances racing to seed: the loser accepts the winner's row rather than failing the request.
 * A failure to write for any other reason is thrown.
 *
 * @param repoUtils The repository for `settingsClass`.
 * @param settingsClass The `SiteSettingsSQL`/`SiteSettingsMongo` model, to build the row that's written.
 * @param configured The raw `site_settings` config, as injected with `@Config("site_settings", null)`.
 */
export async function getOrCreateSiteSettings<T extends SiteSettingsEntity>(
    repoUtils: RepoUtils<T>,
    settingsClass: any,
    configured: unknown,
): Promise<T> {
    const existing = await repoUtils.findOne(SITE_SETTINGS_UID, { ignoreACL: true });
    if (existing?.seeded) {
        return existing;
    }

    const { fields } = siteSettingsSeedFromConfig(configured);
    const patch: Record<string, unknown> = { seeded: true };
    for (const key of SITE_SETTINGS_SEED_FIELDS) {
        // Only fill what's still empty: a value saved before seeding existed is the admin's, not config's.
        if (fields[key] !== undefined && (!existing || isEmptyField(existing[key]))) {
            patch[key] = fields[key];
        }
    }

    try {
        return existing
            ? await repoUtils.update(new settingsClass({ ...existing, ...patch }), existing, { ignoreACL: true })
            : await repoUtils.create({ uid: SITE_SETTINGS_UID, ...patch } as Partial<T>, { ignoreACL: true });
    } catch (err) {
        // Another instance seeded it at the same moment; what it wrote is what would have been.
        if (existing) {
            const raced = await repoUtils.findOne(SITE_SETTINGS_UID, { ignoreACL: true });
            if (raced?.seeded) {
                return raced;
            }
        } else if (err instanceof ApiError && err.code === ApiErrors.IDENTIFIER_EXISTS) {
            const raced = await repoUtils.findOne(SITE_SETTINGS_UID, { ignoreACL: true });
            if (raced) {
                return raced;
            }
        }
        throw err;
    }
}

/**
 * Reads the current deployment-wide branding settings in-process, without an HTTP round-trip —
 * for a consumer that isn't itself a `BaseSiteSettingsRoute` (e.g. `wwwRoute`/`AdminConsoleRoute`,
 * which need `PublicSiteSettings` server-side to feed into `apps/*'s` page props/`_layout.tsx` for
 * SSR branding — see those classes' own `fetchProps()` overrides). Constructs its own short-lived
 * `RepoUtils` and reads the row through `getOrCreateSiteSettings()`, the same path
 * `BaseSiteSettingsRoute` uses, so the deployment's config seeds it here too if this runs first.
 *
 * @param configured The raw `site_settings` config (`@Config("site_settings", null)`); see `getOrCreateSiteSettings()`.
 */
export async function readPublicSiteSettings(
    objectFactory: ObjectFactory,
    settingsClass: any,
    configured: unknown,
): Promise<PublicSiteSettings> {
    const repoUtils: RepoUtils<SiteSettingsEntity> = await objectFactory.newInstance(RepoUtils, {
        name: settingsClass.name,
        args: [settingsClass],
    });
    return siteSettingsToPublicDTO(await getOrCreateSiteSettings(repoUtils, settingsClass, configured));
}

/** A `PublicSiteSettings` with every field at its "nothing configured" default — used when a settings read fails. */
const DEFAULT_PUBLIC_SITE_SETTINGS: PublicSiteSettings = {
    logoUploaded: false,
    iconUploaded: false,
    stylesheetUploaded: false,
};

/**
 * Convenience wrapper around `readPublicSiteSettings()` for `wwwRoute`/`AdminConsoleRoute`'s own
 * `fetchProps()` overrides (see those classes): never lets a settings-read failure break the whole
 * page render — falls back to `DEFAULT_PUBLIC_SITE_SETTINGS` instead (with whatever the deployment's
 * `site_settings` config supplies laid over it, so a deployment branded through config isn't shown
 * with the stock branding just because the database couldn't be read), the same "safe default" every
 * other branding consumer in this app already falls back to.
 */
export async function fetchSiteSettingsPropsForSSR(
    objectFactory: ObjectFactory,
    settingsClass: any,
    configured: unknown,
): Promise<{ siteSettings: PublicSiteSettings }> {
    try {
        return { siteSettings: await readPublicSiteSettings(objectFactory, settingsClass, configured) };
    } catch {
        return { siteSettings: { ...DEFAULT_PUBLIC_SITE_SETTINGS, ...siteSettingsSeedFromConfig(configured).fields } };
    }
}

/**
 * Deployment-wide branding for `apps/www` and `apps/admin` — site title, company name, header/footer
 * content, and a logo/icon/stylesheet each supplied either as an external reference URL or a directly
 * uploaded asset. `logoUrl` is the full logo/watermark (sign-in/sign-up/consent pages); `iconUrl` is a
 * separate, compact mark for navigation headers — independently configurable, with no fallback between
 * them enforced server-side (consumers decide how to fall back, e.g. `apps/shared/lib/siteSettings.ts`).
 * Read (`GET`) is public and unauthenticated (both console apps, including anonymous `www`
 * visitors, need it to render their own chrome); every write requires the `admin` trusted role via
 * `@RequiresTrustedRole()`, the same convention `BaseImpersonationRoute`/`BaseOAuthClientRoute` use.
 *
 * The admin console is where these are edited, but an app that deploys this server can pre-brand it through the
 * `site_settings` config key (`siteTitle`, `companyName`, `headerHtml`, `footerHtml`, `logoUrl`, `iconUrl`,
 * `stylesheetUrl`; e.g. the `site_settings__siteTitle` environment variable): config seeds the row the first time
 * it's read, and from then on the row is the source of truth (see `getOrCreateSiteSettings()`).
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

    /** The deployment's `site_settings` config, which seeds the row the first time it's read. See `getOrCreateSiteSettings()`. */
    @Config("site_settings", null)
    protected configuredSiteSettings: unknown = null;

    @Logger
    protected logger?: any;

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

        // Say once, at startup, which configured values will be ignored — the row may well be seeded already, or
        // seeded by `wwwRoute` first, so this is the one place every bad entry is reliably reported.
        for (const problem of siteSettingsSeedFromConfig(this.configuredSiteSettings).rejected) {
            this.logger?.warn(`Ignoring the site settings config: ${problem}`);
        }
        // Best effort: it's seeded on first use anyway, so a database that isn't reachable yet mustn't stop the server.
        try {
            await this.getOrCreate();
        } catch (err) {
            this.logger?.warn(
                `Unable to seed the site settings from config, so they're seeded on first use instead: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /**
     * Fetches the single settings row, creating it (seeded from the deployment's `site_settings` config) on
     * first access, or seeding it if it predates seeding. See `getOrCreateSiteSettings()`, which this shares with every
     * other reader of the row so that whichever runs first does the seeding.
     */
    protected async getOrCreate(): Promise<T> {
        if (!this.repoUtils) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        return getOrCreateSiteSettings(this.repoUtils, this.settingsClass, this.configuredSiteSettings);
    }

    protected toPublicDTO(entity: T): PublicSiteSettings {
        return siteSettingsToPublicDTO(entity);
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
            "site title, company name, header/footer content, and the configured logo/icon/stylesheet reference " +
            "(plus whether each was instead directly uploaded, in which case `GET .../logo`/`GET .../icon`/" +
            "`GET .../stylesheet` should be used as the source instead of the `logoUrl`/`iconUrl`/`stylesheetUrl` fields).",
    )
    @Returns([Object])
    @Get()
    @RateLimit()
    public async getSettings(): Promise<PublicSiteSettings> {
        return this.toPublicDTO(await this.getOrCreate());
    }

    @Summary("Update site customization settings")
    @Description(
        "Trusted-role-only. Partially updates the deployment's branding text fields and/or logo/icon/stylesheet " +
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
        if (body?.iconUrl !== undefined) changes.iconUrl = body.iconUrl;
        if (body?.stylesheetUrl !== undefined) changes.stylesheetUrl = body.stylesheetUrl;
        return this.applyUpdate(changes);
    }

    @Summary("Reset the site settings to the deployment's config")
    @Description(
        "Trusted-role-only. Overwrites every branding text field and logo/icon/stylesheet reference URL with what " +
            "the deployment's `site_settings` config says right now, clearing any field it doesn't set, and removes " +
            "any directly uploaded logo, icon or stylesheet so a configured reference URL (or nothing) actually " +
            "takes effect. Config only seeds these fields once, when the row is first read, so this is how a " +
            "change to `site_settings` reaches a deployment that's already seeded (after a restart, since config is " +
            "read at start-up).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/reset")
    @RequiresTrustedRole()
    @RateLimit()
    public async resetSettings(): Promise<PublicSiteSettings> {
        const { fields } = siteSettingsSeedFromConfig(this.configuredSiteSettings);
        const changes: Record<string, string | null> = {
            // Reverting a reference URL only matters if an uploaded asset isn't still taking precedence over it.
            logoData: null,
            logoContentType: null,
            iconData: null,
            iconContentType: null,
            stylesheetCss: null,
        };
        for (const field of SITE_SETTINGS_SEED_FIELDS) {
            changes[field] = fields[field] ?? null;
        }
        return this.applyUpdate(changes);
    }

    @Summary("Upload a logo image")
    @Description(
        "Trusted-role-only. The request body is the raw image bytes (`Content-Type` must be one of " +
            ALLOWED_IMAGE_CONTENT_TYPES.join(", ") +
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
        if (!contentType || !ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
            throw new ApiError(
                ApiErrors.INVALID_REQUEST,
                400,
                `Unsupported logo content type. Allowed: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}.`,
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

    @Summary("Upload an icon image")
    @Description(
        "Trusted-role-only. The compact mark shown in navigation headers, as opposed to the full logo. " +
            "The request body is the raw image bytes (`Content-Type` must be one of " +
            ALLOWED_IMAGE_CONTENT_TYPES.join(", ") +
            `, max ${MAX_ICON_BYTES} bytes). Once uploaded, ` +
            "`GET .../icon` serves it and it takes precedence over any configured `iconUrl`.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/icon")
    @RequiresTrustedRole()
    @RateLimit()
    public async uploadIcon(@Request req: HttpRequest): Promise<PublicSiteSettings> {
        const contentType = BaseSiteSettingsRoute.headerValue(req, "content-type")
            ?.split(";")[0]
            ?.trim()
            .toLowerCase();
        if (!contentType || !ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
            throw new ApiError(
                ApiErrors.INVALID_REQUEST,
                400,
                `Unsupported icon content type. Allowed: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}.`,
            );
        }
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
            throw new ApiError(ApiErrors.INVALID_REQUEST, 400, ApiErrorMessages.INVALID_REQUEST);
        }
        if (body.length > MAX_ICON_BYTES) {
            throw new ApiError(ApiErrors.PAYLOAD_TOO_LARGE, 413, ApiErrorMessages.PAYLOAD_TOO_LARGE);
        }

        return this.applyUpdate({ iconData: body.toString("base64"), iconContentType: contentType });
    }

    @Summary("Remove the uploaded icon image")
    @Description("Trusted-role-only. Clears any directly uploaded icon, reverting to `iconUrl` (if configured).")
    @Returns([Object])
    @Auth(["jwt"])
    @Delete("/icon")
    @RequiresTrustedRole()
    @RateLimit()
    public async deleteIcon(): Promise<PublicSiteSettings> {
        return this.applyUpdate({ iconData: null, iconContentType: null });
    }

    @Summary("Fetch the uploaded icon image")
    @Description("Public, unauthenticated. 404s when no icon has been directly uploaded.")
    @Get("/icon")
    @RateLimit()
    public async getIcon(@Response res: HttpResponse): Promise<void> {
        const existing = await this.getOrCreate();
        if (!existing.iconData || !existing.iconContentType) {
            res.status(404).end();
            return;
        }
        res.setHeader("content-type", existing.iconContentType);
        res.setHeader("cache-control", "public, max-age=300");
        res.end(Buffer.from(existing.iconData, "base64"));
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
