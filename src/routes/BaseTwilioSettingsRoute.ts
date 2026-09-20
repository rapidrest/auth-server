///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import type { TwilioSettingsDTO, TwilioSettingsInput } from "../messaging/MessagingSettings.js";

const { Init, Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, Post, Put, RateLimit, RequiresTrustedRole } = RouteDecorators;

/**
 * Admin-console endpoints for the Twilio credentials and sender SMS is sent with, so they can be set or rotated
 * without a redeploy. Every endpoint requires the `admin` trusted role via `@RequiresTrustedRole()`. The deployment's
 * config seeds them the first time (see `MessagingSettingsStore`).
 *
 * The auth token is write-only: it's accepted here, encrypted at rest, and never returned by any endpoint — the
 * response only says whether one is set. Kept at its own path rather than under `/settings/messages`, where a
 * `/:name` route would otherwise claim it as a template called `twilio`.
 *
 * A thin layer over `BaseDatabaseMessagingUtils`, like `BaseMessageTemplateRoute`.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseTwilioSettingsRoute {
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

    @Summary("Get the Twilio settings")
    @Description(
        "Trusted-role-only. The Twilio Account SID, whether an auth token is set (the token itself is never " +
            "returned), the sender texts come from, and whether a text could be sent right now (`configured`).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async get(): Promise<TwilioSettingsDTO> {
        return this.utils.getTwilioSettings();
    }

    @Summary("Reset the Twilio settings to the deployment's config")
    @Description(
        "Trusted-role-only. Overwrites the Twilio credentials and SMS sender with what the deployment's config says, " +
            "and clears any the config doesn't have. Config only seeds these the first time, so this is how a change " +
            "to it reaches a deployment that's already started (after a restart, since config is read at start-up).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/reset")
    @RequiresTrustedRole()
    @RateLimit()
    public async reset(): Promise<TwilioSettingsDTO> {
        return this.utils.resetTwilioSettings();
    }

    @Summary("Update the Twilio settings")
    @Description(
        "Trusted-role-only. Sets the Account SID, auth token and/or sender (`from`: a phone number in international " +
            "format, or an alphanumeric sender ID). An omitted key is left untouched and an explicit `null` clears " +
            "it. The token is encrypted before it's stored. The next SMS uses the change, with no restart.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put()
    @RequiresTrustedRole()
    @RateLimit()
    public async update(body: TwilioSettingsInput): Promise<TwilioSettingsDTO> {
        return this.utils.updateTwilioSettings(body ?? {});
    }
}
