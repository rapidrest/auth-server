///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import type { OriginSettings } from "@rapidrest/core";
import type { DescribedTemplate } from "./messaging/MessageTemplates.js";

/**
 * Default templates for every e-mail and SMS message this server sends, used as the `templates` config block by
 * `config.sql.ts`/`config.mongo.ts`. `@rapidrest/core`'s `MessagingUtils` renders each one with Handlebars. Without
 * a template of the right name the send fails inside `MessagingUtils.loadTemplate()` and the routes log and swallow
 * it — so the code silently never arrives — which is why every name the server sends is listed here, even though
 * they read alike.
 *
 * `login-otp` is the sign-in code for OTP and multi-factor sign-in, and for confirming it's you before a sensitive
 * change (elevation). `verify-contact-otp` proves a contact (e-mail address or phone number) added to an account is
 * the user's. `register-otp` proves the contact given while creating an account. Each goes out by e-mail and SMS.
 *
 * **Variables.** `{{totp}}` is the code. `{{brand.name}}`, `{{brand.logoUrl}}` and the rest of `brand` come from the
 * site branding (set in the admin console — see `BaseDatabaseMessagingUtils`), which is how these defaults look like
 * the site they were sent from with nothing to configure. In the plain-text parts (`subject`, `text`, `sms`) a brand
 * value is written `{{{brand.name}}}` — three braces — because Handlebars escapes `{{ }}` for HTML, which would turn
 * "Tom & Jerry" into `Tom &amp; Jerry` in a place that isn't HTML. In `html` it's the two-brace form, which escapes.
 *
 * **Changing them.** Normally from the admin console, which stores the edit in the database and needs no redeploy;
 * each part an admin hasn't touched keeps following these defaults. To change them for a whole deployment instead,
 * set any part of any entry in your own config — values merge over these key by key, so changing one `subject`
 * leaves the rest alone. Per template: `subject`, `text` and `html` for e-mail, `sms` for SMS, `htmlPath`/`textPath`
 * to read a body from a file, and `enabled: false` to stop sending it at all. An e-mail with an `html` part is shown
 * as that, not as `text`, so to send plain text only, set `html: ""`.
 *
 * **How they're sent** — `smtp_config` for e-mail, `twilio` for SMS, and the `from` address/number for each — is
 * config too, and nothing is sent until it's set (`from` is left empty here on purpose rather than sending as a
 * domain nobody set up). Config only *seeds* those: the first time the server reads them they're copied into the
 * database (secrets encrypted, see `MessagingSettingsSQL`), and from then on the admin console's Messages page edits
 * them and what's saved there is what's used — with no redeploy. So changing these blocks after the first start
 * doesn't reach a running deployment by itself: edit them in the console, or restart with the new values and press
 * "Reset to configuration" on that card to copy them in. Options beyond the fields the console models
 * (nodemailer's `tls`, Twilio's `options`) stay in config and are merged in. See `MessagingSettingsStore`.
 */

const IGNORE_NOTE = "If you didn't request this, you can ignore this message. Never share this code with anyone.";

/**
 * A branded HTML e-mail around one line of introduction and the code: the logo (or, without one, the name) on top.
 * Kept to inline styles and nested tables because that's what mail clients reliably render.
 */
function emailHtml(intro: string): string {
    return [
        `<!DOCTYPE html>`,
        `<html>`,
        `<body style="margin:0;padding:0;background-color:#f4f4f5;">`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">`,
        `<tr><td align="center">`,
        `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#18181b;">`,
        `<tr><td style="padding-bottom:24px;">`,
        `{{#if brand.logoUrl}}<img src="{{brand.logoUrl}}" alt="{{brand.name}}" height="40" style="display:block;height:40px;border:0;">{{else}}<span style="font-size:20px;font-weight:bold;">{{brand.name}}</span>{{/if}}`,
        `</td></tr>`,
        `<tr><td style="font-size:16px;line-height:24px;">`,
        `<p style="margin:0 0 16px;">${intro}</p>`,
        `<p style="margin:0 0 24px;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:6px;">{{totp}}</p>`,
        `<p style="margin:0;font-size:14px;line-height:20px;color:#52525b;">${IGNORE_NOTE}</p>`,
        `</td></tr>`,
        `</table>`,
        `</td></tr>`,
        `</table>`,
        `</body>`,
        `</html>`,
    ].join("\n");
}

/** The same message as plain text, with the name where the logo would be. */
function emailText(intro: string): string {
    return `{{{brand.name}}}\n\n${intro}: {{totp}}\n\n${IGNORE_NOTE}`;
}

export const DEFAULT_MESSAGE_TEMPLATES = {
    from: {
        email: "",
        sms: "",
    } satisfies OriginSettings,

    "login-otp": {
        enabled: true,
        title: "Sign-in code",
        description:
            "Sent to sign someone in with a one-time code, as a second factor, or to confirm it's really them " +
            "before a sensitive change.",
        subject: "Your {{{brand.name}}} sign-in verification code",
        text: emailText("Use this code to finish signing in or to confirm it's you"),
        html: emailHtml("Use this code to finish signing in or to confirm it&rsquo;s you:"),
        sms: "{{{brand.name}}}: your code to sign in or confirm it's you is {{totp}}. Never share it with anyone.",
    } satisfies DescribedTemplate,

    "verify-contact-otp": {
        enabled: true,
        title: "Contact verification code",
        description: "Sent to verify an e-mail address or phone number that was added to an account.",
        subject: "Verify your {{{brand.name}}} contact",
        text: emailText("Use this code to verify this e-mail address for your account"),
        html: emailHtml("Use this code to verify this e-mail address for your account:"),
        sms: "{{{brand.name}}}: your code to verify this phone number for your account is {{totp}}. Never share it with anyone.",
    } satisfies DescribedTemplate,

    "register-otp": {
        enabled: true,
        title: "Sign-up code",
        description: "Sent to confirm the e-mail address or phone number given when creating an account.",
        subject: "Confirm your e-mail to create your {{{brand.name}}} account",
        text: emailText("Use this code to confirm your e-mail address and finish creating your account"),
        html: emailHtml("Use this code to confirm your e-mail address and finish creating your account:"),
        sms: "{{{brand.name}}}: your code to confirm your phone number and finish creating your account is {{totp}}. Never share it with anyone.",
    } satisfies DescribedTemplate,
};
