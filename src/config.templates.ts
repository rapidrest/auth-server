///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { OriginSettings, Template } from "@rapidrest/core";

/**
 * Default templates for every e-mail and SMS message this server sends, used as the `templates` config block by
 * `config.sql.ts`/`config.mongo.ts`. `@rapidrest/core`'s `MessagingUtils` renders each one with Handlebars, and
 * every message here is a one-time code passed in as `{{totp}}`. Without a template of the right name, the send
 * fails inside `MessagingUtils.loadTemplate()` and the routes log and swallow it — so the code silently never
 * arrives — which is why every name the server sends is listed here, even though they read alike.
 *
 * `login-otp` is the sign-in code for OTP and multi-factor sign-in, and for confirming it's you before a sensitive
 * change (elevation). `verify-contact-otp` proves a contact (e-mail address or phone number) added to an account is
 * the user's. `register-otp` proves the contact given while creating an account. Each goes out by e-mail and SMS.
 *
 * Overriding downstream: set any part of any entry, or the whole block, in your own config; values merge over these
 * key by key, so changing one `subject` leaves everything else at its default. Per template: `subject` and `text`
 * (and optionally `html`) for e-mail, `sms` for SMS, `htmlPath`/`textPath` to read the body from a file instead,
 * and `enabled: false` to stop sending it altogether. A default is deliberately plain text with no `html`: an
 * `html` part is preferred by mail clients over `text`, so a default one would silently shadow a `text` override.
 * Add `html` (or `htmlPath`) yourself to send a multipart message.
 *
 * Nothing is sent until the transports are configured too: `smtp_config` for e-mail and `twilio` for SMS, and a
 * `from` address/number for each (left empty here on purpose rather than sending as a domain nobody set up).
 */
export const DEFAULT_MESSAGE_TEMPLATES = {
    from: {
        email: "",
        sms: "",
    } satisfies OriginSettings,

    "login-otp": {
        enabled: true,
        subject: "Your sign-in verification code",
        text:
            "Use this code to finish signing in or to confirm it's you: {{totp}}\n\n" +
            "If you didn't request this, you can ignore this message. Never share this code with anyone.",
        sms: "Your verification code to sign in or confirm it's you is {{totp}}. Never share it with anyone.",
    } satisfies Template,

    "verify-contact-otp": {
        enabled: true,
        subject: "Verify your contact",
        text:
            "Use this code to verify this e-mail address for your account: {{totp}}\n\n" +
            "If you didn't request this, you can ignore this message. Never share this code with anyone.",
        sms: "Your code to verify this phone number for your account is {{totp}}. Never share it with anyone.",
    } satisfies Template,

    "register-otp": {
        enabled: true,
        subject: "Confirm your e-mail to create your account",
        text:
            "Use this code to confirm your e-mail address and finish creating your account: {{totp}}\n\n" +
            "If you didn't request this, you can ignore this message. Never share this code with anyone.",
        sms: "Your code to confirm your phone number and finish creating your account is {{totp}}. Never share it with anyone.",
    } satisfies Template,
};
