///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
// Proves the default message templates are actually wired into the mongo config, and that a downstream override
// merges over them key by key (leaving every other default in place) rather than replacing the whole block.
import { afterEach, describe, expect, it } from "vitest";
import config from "../src/config.mongo.js";
import { DEFAULT_MESSAGE_TEMPLATES } from "../src/config.templates.js";

describe("Message templates config (mongo)", () => {
    afterEach(() => {
        config.clear("templates:login-otp:subject");
        config.clear("templates:from:email");
    });

    it("provides a default for every message the server sends", () => {
        expect(config.get("templates")).toEqual(DEFAULT_MESSAGE_TEMPLATES);
    });

    it("merges a downstream override over the default for just that key", () => {
        config.set("templates:login-otp:subject", "Acme sign-in code");
        config.set("templates:from:email", "no-reply@acme.test");

        const templates = config.get("templates");

        expect(templates["login-otp"]).toEqual({ ...DEFAULT_MESSAGE_TEMPLATES["login-otp"], subject: "Acme sign-in code" });
        expect(templates.from).toEqual({ ...DEFAULT_MESSAGE_TEMPLATES.from, email: "no-reply@acme.test" });
        expect(templates["register-otp"]).toEqual(DEFAULT_MESSAGE_TEMPLATES["register-otp"]);
    });

    it("leaves the shared defaults themselves untouched by an override", () => {
        config.set("templates:login-otp:subject", "Acme sign-in code");

        expect(DEFAULT_MESSAGE_TEMPLATES["login-otp"].subject).toBe("Your {{{brand.name}}} sign-in verification code");
    });
});
