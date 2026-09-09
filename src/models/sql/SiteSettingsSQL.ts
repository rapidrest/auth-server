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
 * Deployment-wide branding/customization for `apps/www` and `apps/admin`, editable exclusively
 * through the admin console (see `BaseSiteSettingsRoute`). A singleton — always read/written under
 * `BaseSiteSettingsRoute.SITE_SETTINGS_UID` — rather than a generic CRUD resource.
 *
 * `logoUrl`/`stylesheetUrl` are external reference URLs; `logoData`/`stylesheetCss` hold a directly
 * uploaded asset's content (base64-encoded image bytes, raw CSS text respectively) alongside its
 * `logoContentType`. Storing uploads on this row (rather than the filesystem) is deliberate: this
 * app already assumes a shared SQL/Mongo backing store across instances, so this keeps an uploaded
 * asset available from every instance with no extra shared-volume plumbing.
 *
 * If MongoDB is desired, please use `models.mongo.SiteSettingsMongo` instead.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("sql")
@Entity()
@Description("Deployment-wide branding/customization settings for the www and admin console apps.")
@Protect(
    {
        uid: "SiteSettings",
        records: [
            {
                userOrRoleId: ".*",
                actions: [],
            },
        ],
    },
    false,
)
export class SiteSettingsSQL extends BaseEntity {
    @Column({ nullable: true })
    @Nullable
    public siteTitle?: string;

    @Column({ nullable: true })
    @Nullable
    public companyName?: string;

    @Column({ nullable: true })
    @Nullable
    public headerHtml?: string;

    @Column({ nullable: true })
    @Nullable
    public footerHtml?: string;

    @Column({ nullable: true })
    @Nullable
    public logoUrl?: string;

    /** Base64-encoded bytes of a directly uploaded logo image. Mutually rendered in preference to `logoUrl`. */
    @Column({ nullable: true })
    @Nullable
    public logoData?: string;

    @Column({ nullable: true })
    @Nullable
    public logoContentType?: string;

    @Column({ nullable: true })
    @Nullable
    public stylesheetUrl?: string;

    /** Raw CSS text of a directly uploaded stylesheet. Rendered in preference to `stylesheetUrl`. */
    @Column({ nullable: true })
    @Nullable
    public stylesheetCss?: string;

    constructor(other?: Partial<SiteSettingsSQL>) {
        super(other);

        if (other) {
            this.siteTitle = other.siteTitle !== undefined ? other.siteTitle : this.siteTitle;
            this.companyName = other.companyName !== undefined ? other.companyName : this.companyName;
            this.headerHtml = other.headerHtml !== undefined ? other.headerHtml : this.headerHtml;
            this.footerHtml = other.footerHtml !== undefined ? other.footerHtml : this.footerHtml;
            this.logoUrl = other.logoUrl !== undefined ? other.logoUrl : this.logoUrl;
            this.logoData = other.logoData !== undefined ? other.logoData : this.logoData;
            this.logoContentType = other.logoContentType !== undefined ? other.logoContentType : this.logoContentType;
            this.stylesheetUrl = other.stylesheetUrl !== undefined ? other.stylesheetUrl : this.stylesheetUrl;
            this.stylesheetCss = other.stylesheetCss !== undefined ? other.stylesheetCss : this.stylesheetCss;
        }
    }
}
