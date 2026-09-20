///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import type { SmtpSettingsDTO, SmtpSettingsInput } from "../messaging/MessagingSettings.js";

const { Init, Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, Post, Put, RateLimit, RequiresTrustedRole } = RouteDecorators;

/**
 * Admin-console endpoints for the SMTP server and sender e-mail is sent with, so they can be changed or rotated
 * without a redeploy. Every endpoint requires the `admin` trusted role via `@RequiresTrustedRole()`. The deployment's
 * config seeds them the first time (see `MessagingSettingsStore`).
 *
 * The password is write-only: it's accepted here, encrypted at rest, and never returned by any endpoint — the
 * response only says whether one is set.
 *
 * A thin layer over `BaseDatabaseMessagingUtils`, like `BaseMessageTemplateRoute`.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseSmtpSettingsRoute {
    @Inject(MessagingUtils)
    protected messaging?: BaseDatabaseMessagingUtils;

    @Init
    protected initialize(): void {
        // See BaseMessageTemplateRoute.initialize().
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

    @Summary("Get the SMTP settings")
    @Description(
        "Trusted-role-only. The SMTP host, port, whether the connection is secure, the user name, whether a " +
            "password is set (the password itself is never returned), the address e-mails come from, and whether " +
            "an e-mail could be sent right now (`configured`).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async get(): Promise<SmtpSettingsDTO> {
        return this.utils.getSmtpSettings();
    }

    @Summary("Reset the SMTP settings to the deployment's config")
    @Description(
        "Trusted-role-only. Overwrites the SMTP server, its credentials and the e-mail sender with what the deployment's config says, " +
            "and clears any the config doesn't have. Config only seeds these the first time, so this is how a change " +
            "to it reaches a deployment that's already started (after a restart, since config is read at start-up).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/reset")
    @RequiresTrustedRole()
    @RateLimit()
    public async reset(): Promise<SmtpSettingsDTO> {
        return this.utils.resetSmtpSettings();
    }

    @Summary("Update the SMTP settings")
    @Description(
        "Trusted-role-only. Sets the SMTP `host`, `port`, `secure`, `user`, `password` and/or sender (`from`: an " +
            "e-mail address, optionally with a name). An omitted key is left untouched and an explicit `null` " +
            "clears it. The password is encrypted before it's stored. The next e-mail uses the change, with no restart.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put()
    @RequiresTrustedRole()
    @RateLimit()
    public async update(body: SmtpSettingsInput): Promise<SmtpSettingsDTO> {
        return this.utils.updateSmtpSettings(body ?? {});
    }
}
