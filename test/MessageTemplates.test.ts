///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Guards `DEFAULT_MESSAGE_TEMPLATES` against the two ways it can silently go wrong. A missing template doesn't
// fail loudly: `MessagingUtils.loadTemplate()` throws, the route that asked for the send logs and swallows it, and
// the user just never receives their code. So (1) every template name `@rapidrest/auth` can send is scanned for
// out of its shipped code, so a message added upstream fails here until it gets a default, and (2) every default is
// pushed through the real `MessagingUtils` (only the SMTP/Twilio transports are faked) to prove it renders.
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { MessagingUtils } from "@rapidrest/core";
import { DEFAULT_MESSAGE_TEMPLATES } from "../src/config.templates.js";

const AUTH_LIB_DIR = path.join(process.cwd(), "node_modules", "@rapidrest", "auth", "dist", "lib");

function listJsFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listJsFiles(full);
        return entry.name.endsWith(".js") ? [full] : [];
    });
}

/**
 * Every template name `@rapidrest/auth` can ask for: a literal in `sendEmail("x", …)`/`sendSMS("x", …)`/
 * `sendSlack("x", …)`, or the `this.template = "x"` default the OTP/elevation/MFA routes pass to those same calls.
 */
function templateNamesSentByAuthLibrary(): Set<string> {
    const names = new Set<string>();
    for (const file of listJsFiles(AUTH_LIB_DIR)) {
        const source = fs.readFileSync(file, "utf-8");
        for (const match of source.matchAll(/\.send(?:Email|SMS|Slack)\(\s*"([^"]+)"/g)) names.add(match[1]);
        for (const match of source.matchAll(/\.template\s*=\s*"([^"]+)"/g)) names.add(match[1]);
    }
    return names;
}

const MESSAGE_NAMES = Object.keys(DEFAULT_MESSAGE_TEMPLATES).filter((name) => name !== "from");

/** A `MessagingUtils` with only its SMTP/Twilio transports faked — everything from template lookup to rendering is real. */
function makeMessaging(templates: Record<string, unknown>) {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "m1" });
    const create = vi.fn().mockResolvedValue({ sid: "s1" });
    const messaging = new MessagingUtils() as any;
    messaging.templates = structuredClone(templates);
    messaging.smtpConfig = { host: "smtp.test" };
    messaging._transporter = { sendMail };
    messaging.twilio = { messages: { create } };
    return { messaging: messaging as MessagingUtils, sendMail, create };
}

const WITH_SENDERS = {
    ...DEFAULT_MESSAGE_TEMPLATES,
    from: { email: "no-reply@example.test", sms: "+15555550100" },
};

describe("default message templates", () => {
    it("scan finds the names the auth library sends, so the drift guard can't pass by finding nothing", () => {
        expect([...templateNamesSentByAuthLibrary()].sort()).toEqual(expect.arrayContaining(["login-otp", "register-otp", "verify-contact-otp"]));
    });

    it("has a default for every template name the auth library can send", () => {
        const missing = [...templateNamesSentByAuthLibrary()].filter((name) => !MESSAGE_NAMES.includes(name));

        expect(missing, `Add a default to DEFAULT_MESSAGE_TEMPLATES for: ${missing.join(", ")}`).toEqual([]);
    });

    it.each(MESSAGE_NAMES)("'%s' is enabled and has both an e-mail and an SMS body, as plain text", (name) => {
        const template = (DEFAULT_MESSAGE_TEMPLATES as Record<string, any>)[name];

        expect(template.enabled).toBe(true);
        expect(template.subject).toEqual(expect.any(String));
        expect(template.subject).not.toBe("");
        expect(template.text).toContain("{{totp}}");
        expect(template.sms).toContain("{{totp}}");
        // No default `html`: it would outrank a downstream `text` override in every mail client.
        expect(template.html).toBeUndefined();
        expect(template.htmlPath).toBeUndefined();
    });

    it.each(MESSAGE_NAMES)("'%s' renders its code into an e-mail through the real MessagingUtils", async (name) => {
        const { messaging, sendMail } = makeMessaging(WITH_SENDERS);

        await messaging.sendEmail(name, { totp: "482913" }, { to: "user@example.test" });

        expect(sendMail).toHaveBeenCalledTimes(1);
        const message = sendMail.mock.calls[0][0];
        expect(message.to).toBe("user@example.test");
        expect(message.from).toBe("no-reply@example.test");
        expect(message.subject).toEqual(expect.any(String));
        expect(message.subject).not.toBe("");
        expect(message.text).toContain("482913");
        expect(message.text).not.toContain("{{");
        expect(message.html).toBeNull();
    });

    it.each(MESSAGE_NAMES)("'%s' renders its code into an SMS through the real MessagingUtils", async (name) => {
        const { messaging, create } = makeMessaging(WITH_SENDERS);

        await messaging.sendSMS(name, { totp: "482913" }, { to: "+15555550123" });

        expect(create).toHaveBeenCalledTimes(1);
        const message = create.mock.calls[0][0];
        expect(message.to).toBe("+15555550123");
        expect(message.from).toBe("+15555550100");
        expect(message.body).toContain("482913");
        expect(message.body).not.toContain("{{");
    });

    it("keeps an SMS short enough for a single segment", () => {
        for (const name of MESSAGE_NAMES) {
            const sms: string = (DEFAULT_MESSAGE_TEMPLATES as Record<string, any>)[name].sms;
            // Rendered with a 6-digit code in place of the 7-character placeholder.
            expect(sms.length - "{{totp}}".length + 6, name).toBeLessThanOrEqual(160);
        }
    });

    it("sends nothing until a from address/number is configured, rather than sending as an invented sender", async () => {
        const { messaging, sendMail, create } = makeMessaging(DEFAULT_MESSAGE_TEMPLATES);

        await expect(messaging.sendEmail("login-otp", { totp: "482913" }, { to: "user@example.test" })).resolves.toBeUndefined();
        await expect(messaging.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" })).resolves.toBeUndefined();

        expect(sendMail).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("sends nothing for a template a downstream config disables", async () => {
        const { messaging, sendMail, create } = makeMessaging({
            ...WITH_SENDERS,
            "login-otp": { ...DEFAULT_MESSAGE_TEMPLATES["login-otp"], enabled: false },
        });

        await messaging.sendEmail("login-otp", { totp: "482913" }, { to: "user@example.test" });
        await messaging.sendSMS("login-otp", { totp: "482913" }, { to: "+15555550123" });

        expect(sendMail).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("uses a downstream text override rather than the default, because no default html shadows it", async () => {
        const { messaging, sendMail } = makeMessaging({
            ...WITH_SENDERS,
            "login-otp": { ...DEFAULT_MESSAGE_TEMPLATES["login-otp"], text: "Acme code: {{totp}}" },
        });

        await messaging.sendEmail("login-otp", { totp: "482913" }, { to: "user@example.test" });

        expect(sendMail.mock.calls[0][0]).toMatchObject({ text: "Acme code: 482913", html: null });
    });
});
