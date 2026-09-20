///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import type {
    MessageTemplateDetail,
    MessageTemplateOverride,
    MessageTemplateSummary,
    RenderedMessage,
} from "../messaging/MessageTemplates.js";

const { Init, Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Delete, Get, Param, Post, Put, RateLimit, RequiresTrustedRole } = RouteDecorators;

/**
 * Admin-console endpoints for the e-mail/SMS templates this server sends: list them, read one, edit it, put it back
 * to its default, and preview what it would render to. Every endpoint requires the `admin` trusted role via
 * `@RequiresTrustedRole()`, the same convention as `BaseSiteSettingsRoute`'s writes — reads included, since a
 * template's wording isn't something to hand to an anonymous visitor.
 *
 * A thin layer: all of the behavior lives in `BaseDatabaseMessagingUtils`, the `MessagingUtils` this server runs,
 * so that what these endpoints preview and validate is exactly what a real send renders.
 *
 * Like `BaseSiteSettingsRoute`, deliberately not a `ModelRoute`/`CRUDRoute`: authorization is decided entirely by
 * `@RequiresTrustedRole()`, not by the model's own (deny-all) ACL.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseMessageTemplateRoute {
    @Inject(MessagingUtils)
    protected messaging?: BaseDatabaseMessagingUtils;

    @Init
    protected initialize(): void {
        // `MessagingUtils` is only this class if `src/{sql,mongo}/MessagingUtils.ts` was loaded and registered under
        // that name — see `BaseDatabaseMessagingUtils`. Failing here beats a route that quietly edits templates
        // nothing ever reads.
        if (!(this.messaging instanceof BaseDatabaseMessagingUtils)) {
            throw new Error("The database-backed MessagingUtils is not registered.");
        }
    }

    protected get utils(): BaseDatabaseMessagingUtils {
        if (!this.messaging) {
            throw new ApiError(ApiErrors.INTERNAL_ERROR, 500, ApiErrorMessages.INTERNAL_ERROR);
        }
        return this.messaging;
    }

    @Summary("List the message templates")
    @Description(
        "Trusted-role-only. Every e-mail/SMS template this server sends, with whether an admin has customized it " +
            "and whether it's currently enabled.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async list(): Promise<MessageTemplateSummary[]> {
        return this.utils.listTemplates();
    }

    @Summary("Get a message template")
    @Description(
        "Trusted-role-only. The template as it's currently sent, alongside what it is with no edits and which " +
            "parts have been edited, plus the variables it can use.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get("/:name")
    @RequiresTrustedRole()
    @RateLimit()
    public async get(@Param("name") name: string): Promise<MessageTemplateDetail> {
        return this.utils.getTemplate(name);
    }

    @Summary("Edit a message template")
    @Description(
        "Trusted-role-only. Partially updates a template's `enabled`, `subject`, `text`, `html` and `sms`. An " +
            "omitted key is left untouched; an explicit `null` puts that part back to its default. A string that " +
            "matches the default exactly is stored as \"not edited\". Refused with a 400 if the result doesn't render.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put("/:name")
    @RequiresTrustedRole()
    @RateLimit()
    public async update(@Param("name") name: string, body: MessageTemplateOverride): Promise<MessageTemplateDetail> {
        return this.utils.updateTemplate(name, body ?? {});
    }

    @Summary("Reset a message template")
    @Description("Trusted-role-only. Discards every edit to the template, putting it back to its default.")
    @Returns([Object])
    @Auth(["jwt"])
    @Delete("/:name")
    @RequiresTrustedRole()
    @RateLimit()
    public async reset(@Param("name") name: string): Promise<MessageTemplateDetail> {
        return this.utils.resetTemplate(name);
    }

    @Summary("Preview a message template")
    @Description(
        "Trusted-role-only. Renders the template with the given edits laid over its default — using the real site " +
            "branding and a sample code — without saving anything. Takes the same body as editing. Refused with a " +
            "400 if it doesn't render.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/:name/preview")
    @RequiresTrustedRole()
    @RateLimit()
    public async preview(@Param("name") name: string, body: MessageTemplateOverride): Promise<RenderedMessage> {
        return this.utils.previewTemplate(name, body ?? {});
    }
}
