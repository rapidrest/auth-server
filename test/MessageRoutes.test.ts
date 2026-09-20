///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Isolated unit tests for the guard clauses in BaseMessageTemplateRoute, BaseTwilioSettingsRoute and
// BaseSmtpSettingsRoute — no HTTP server, no database. The endpoints themselves are covered end to end in MessageTemplateRoute.*.test.ts.
import { describe, expect, it, vi } from "vitest";
import { BaseDatabaseMessagingUtils } from "../src/messaging/BaseDatabaseMessagingUtils.js";
import { BaseMessageTemplateRoute } from "../src/routes/BaseMessageTemplateRoute.js";
import { BaseSmtpSettingsRoute } from "../src/routes/BaseSmtpSettingsRoute.js";
import { BaseTwilioSettingsRoute } from "../src/routes/BaseTwilioSettingsRoute.js";

class TemplateRoute extends BaseMessageTemplateRoute {}
class TwilioRoute extends BaseTwilioSettingsRoute {}
class SmtpRoute extends BaseSmtpSettingsRoute {}

/** A stand-in for the real thing that passes `instanceof`, with every method the routes call as a spy. */
function fakeUtils(): any {
    const utils = Object.create(BaseDatabaseMessagingUtils.prototype);
    for (const method of [
        "listTemplates",
        "getTemplate",
        "updateTemplate",
        "resetTemplate",
        "previewTemplate",
        "getTwilioSettings",
        "updateTwilioSettings",
        "getSmtpSettings",
        "updateSmtpSettings",
        "resetTwilioSettings",
        "resetSmtpSettings",
    ]) {
        utils[method] = vi.fn().mockResolvedValue({ from: method });
    }
    return utils;
}

describe.each([
    ["BaseMessageTemplateRoute", TemplateRoute],
    ["BaseTwilioSettingsRoute", TwilioRoute],
    ["BaseSmtpSettingsRoute", SmtpRoute],
])("%s", (_name, RouteClass) => {
    it("starts when it was given the database-backed MessagingUtils", () => {
        const route = new RouteClass() as any;
        route.messaging = fakeUtils();

        expect(() => route.initialize()).not.toThrow();
    });

    it("refuses to start with the stock MessagingUtils, since it would edit templates nothing reads", () => {
        const route = new RouteClass() as any;
        route.messaging = { sendEmail: vi.fn() };

        expect(() => route.initialize()).toThrow("The database-backed MessagingUtils is not registered.");
    });

    it("refuses to start with no MessagingUtils at all", () => {
        const route = new RouteClass() as any;

        expect(() => route.initialize()).toThrow("The database-backed MessagingUtils is not registered.");
    });

    it("answers with an internal error, not a crash, if it's used without one", () => {
        const route = new RouteClass() as any;

        expect(() => route.utils).toThrow(expect.objectContaining({ status: 500 }));
    });
});

describe("BaseMessageTemplateRoute", () => {
    it("hands each request to the messaging utilities", async () => {
        const route = new TemplateRoute() as any;
        route.messaging = fakeUtils();

        await route.list();
        await route.get("login-otp");
        await route.update("login-otp", { subject: "S" });
        await route.reset("login-otp");
        await route.preview("login-otp", { sms: "T" });

        expect(route.messaging.listTemplates).toHaveBeenCalledWith();
        expect(route.messaging.getTemplate).toHaveBeenCalledWith("login-otp");
        expect(route.messaging.updateTemplate).toHaveBeenCalledWith("login-otp", { subject: "S" });
        expect(route.messaging.resetTemplate).toHaveBeenCalledWith("login-otp");
        expect(route.messaging.previewTemplate).toHaveBeenCalledWith("login-otp", { sms: "T" });
    });

    it("treats a request with no body as no changes", async () => {
        const route = new TemplateRoute() as any;
        route.messaging = fakeUtils();

        await route.update("login-otp", undefined);
        await route.preview("login-otp", undefined);

        expect(route.messaging.updateTemplate).toHaveBeenCalledWith("login-otp", {});
        expect(route.messaging.previewTemplate).toHaveBeenCalledWith("login-otp", {});
    });
});

describe("BaseTwilioSettingsRoute", () => {
    it("hands each request to the messaging utilities", async () => {
        const route = new TwilioRoute() as any;
        route.messaging = fakeUtils();

        await route.get();
        await route.update({ accountSid: "AC1" });
        await route.reset();

        expect(route.messaging.getTwilioSettings).toHaveBeenCalledWith();
        expect(route.messaging.updateTwilioSettings).toHaveBeenCalledWith({ accountSid: "AC1" });
        expect(route.messaging.resetTwilioSettings).toHaveBeenCalledWith();
    });

    it("treats a request with no body as no changes", async () => {
        const route = new TwilioRoute() as any;
        route.messaging = fakeUtils();

        await route.update(undefined);

        expect(route.messaging.updateTwilioSettings).toHaveBeenCalledWith({});
    });
});

describe("BaseSmtpSettingsRoute", () => {
    it("hands each request to the messaging utilities", async () => {
        const route = new SmtpRoute() as any;
        route.messaging = fakeUtils();

        await route.get();
        await route.update({ host: "smtp.acme.test" });
        await route.reset();

        expect(route.messaging.getSmtpSettings).toHaveBeenCalledWith();
        expect(route.messaging.updateSmtpSettings).toHaveBeenCalledWith({ host: "smtp.acme.test" });
        expect(route.messaging.resetSmtpSettings).toHaveBeenCalledWith();
    });

    it("treats a request with no body as no changes", async () => {
        const route = new SmtpRoute() as any;
        route.messaging = fakeUtils();

        await route.update(undefined);

        expect(route.messaging.updateSmtpSettings).toHaveBeenCalledWith({});
    });
});
