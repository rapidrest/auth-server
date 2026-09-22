///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { ApiError, MessagingUtils, ObjectDecorators } from "@rapidrest/core";
import { ApiErrorMessages, ApiErrors, DocDecorators, RouteDecorators } from "@rapidrest/service-core";
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import type { SmsSettingsDTO, SmsSettingsInput } from "../messaging/MessagingSettings.js";

const { Init, Inject } = ObjectDecorators;
const { Description, Returns, Summary } = DocDecorators;
const { Auth, Get, Post, Put, RateLimit, RequiresTrustedRole } = RouteDecorators;

/**
 * Admin-console endpoints for how text messages are sent: which SMS provider (Twilio or Telnyx — one at a time), its
 * credentials and the sender, so they can be set or rotated without a redeploy. Every endpoint requires the `admin`
 * trusted role via `@RequiresTrustedRole()`. The deployment's config (`sms_config`) seeds them the first time (see
 * `MessagingSettingsStore`).
 *
 * The auth token / API key is write-only: it's accepted here, encrypted at rest, and never returned by any endpoint —
 * the response only says whether one is set. Kept at its own path rather than under `/settings/messages`, where a
 * `/:name` route would otherwise claim it as a template called `sms`.
 *
 * A thin layer over `BaseDatabaseMessagingUtils`, like `BaseMessageTemplateRoute`.
 *
 * @author Jean-Philippe Steinmetz
 */
export abstract class BaseSmsSettingsRoute {
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

    @Summary("Get the SMS settings")
    @Description(
        "Trusted-role-only. Which SMS provider sends texts (`twilio` or `telnyx`), each provider's saved settings " +
            "(the secrets themselves are never returned — only whether one is set), the sender texts come from, " +
            "and whether a text could be sent right now (`configured`).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Get()
    @RequiresTrustedRole()
    @RateLimit()
    public async get(): Promise<SmsSettingsDTO> {
        return this.utils.getSmsSettings();
    }

    @Summary("Reset the SMS settings to the deployment's config")
    @Description(
        "Trusted-role-only. Overwrites the SMS provider, its credentials and the SMS sender with what the " +
            "deployment's config says, and clears any the config doesn't have. Config only seeds these the first " +
            "time, so this is how a change to it reaches a deployment that's already started (after a restart, since " +
            "config is read at start-up).",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Post("/reset")
    @RequiresTrustedRole()
    @RateLimit()
    public async reset(): Promise<SmsSettingsDTO> {
        return this.utils.resetSmsSettings();
    }

    @Summary("Update the SMS settings")
    @Description(
        "Trusted-role-only. Sets the SMS `provider` (`twilio` or `telnyx` — only that one sends texts), each " +
            "provider's own settings (`twilio`: `accountSid`, `token`; `telnyx`: `apiKey`, `messagingProfileId`) " +
            "and the sender (`from`: a phone number in international format, or an alphanumeric sender ID). An " +
            "omitted key is left untouched and an explicit `null` clears it. Secrets are encrypted before they're " +
            "stored. The next SMS uses the change, with no restart.",
    )
    @Returns([Object])
    @Auth(["jwt"])
    @Put()
    @RequiresTrustedRole()
    @RateLimit()
    public async update(body: SmsSettingsInput): Promise<SmsSettingsDTO> {
        return this.utils.updateSmsSettings(body ?? {});
    }
}
