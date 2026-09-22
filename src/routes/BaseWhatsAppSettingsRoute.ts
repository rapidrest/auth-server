///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import type { WhatsAppSettingsDTO, WhatsAppSettingsInput } from "../messaging/MessagingSettings.js";

const { Init, Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, Post, Put, RateLimit, RequiresTrustedRole } = RouteDecorators;

/**
 * Admin-console endpoints for the WhatsApp Business Cloud API credentials messages are sent with, so they can be set
 * or rotated without a redeploy. Every endpoint requires the `admin` trusted role via `@RequiresTrustedRole()`. The
 * deployment's config (`whatsapp`) seeds them the first time (see `MessagingSettingsStore`).
 *
 * The access token is write-only: it's accepted here, encrypted at rest, and never returned by any endpoint — the
 * response only says whether one is set. Kept at its own path for the same reason `BaseSmsSettingsRoute` is.
 *
 * A thin layer over `BaseDatabaseMessagingUtils`, like `BaseMessageTemplateRoute`.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseWhatsAppSettingsRoute {
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

    @Summary("Get the WhatsApp settings")
    @Description(
        "Trusted-role-only. The WhatsApp Business phone number ID and Graph API version, whether an access token is " +
            "set (the token itself is never returned), and whether a message could be sent right now (`configured`).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async get(): Promise<WhatsAppSettingsDTO> {
        return this.utils.getWhatsAppSettings();
    }

    @Summary("Reset the WhatsApp settings to the deployment's config")
    @Description(
        "Trusted-role-only. Overwrites the WhatsApp credentials with what the deployment's config says, and clears " +
            "any the config doesn't have. Config only seeds these the first time, so this is how a change to it " +
            "reaches a deployment that's already started (after a restart, since config is read at start-up).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/reset")
    @RequiresTrustedRole()
    @RateLimit()
    public async reset(): Promise<WhatsAppSettingsDTO> {
        return this.utils.resetWhatsAppSettings();
    }

    @Summary("Update the WhatsApp settings")
    @Description(
        "Trusted-role-only. Sets the WhatsApp Business `phoneNumberId` (Meta's ID for the number, not the number " +
            "itself), the `accessToken` and, optionally, the Graph `apiVersion` (like `v23.0`). An omitted key is " +
            "left untouched and an explicit `null` clears it. The token is encrypted before it's stored. The next " +
            "message uses the change, with no restart.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put()
    @RequiresTrustedRole()
    @RateLimit()
    public async update(body: WhatsAppSettingsInput): Promise<WhatsAppSettingsDTO> {
        return this.utils.updateWhatsAppSettings(body ?? {});
    }
}
