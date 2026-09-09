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
 * Implementation of `SiteSettingsSQL`'s shape for storage in a MongoDB database. If SQL is desired,
 * please use `models.sql.SiteSettingsSQL` instead. See that class for field documentation.
 *
 * @author Jean-Philippe Steinmetz
 */
@DataStore("mongo")
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
export class SiteSettingsMongo extends BaseMongoEntity {
    @Column()
    @Nullable
    public siteTitle?: string;

    @Column()
    @Nullable
    public companyName?: string;

    @Column()
    @Nullable
    public headerHtml?: string;

    @Column()
    @Nullable
    public footerHtml?: string;

    @Column()
    @Nullable
    public logoUrl?: string;

    @Column()
    @Nullable
    public logoData?: string;

    @Column()
    @Nullable
    public logoContentType?: string;

    @Column()
    @Nullable
    public stylesheetUrl?: string;

    @Column()
    @Nullable
    public stylesheetCss?: string;

    constructor(other?: Partial<SiteSettingsMongo>) {
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
