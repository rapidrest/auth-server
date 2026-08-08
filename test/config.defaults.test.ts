///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import {
    assertProductionSecretsAreSet,
    DEFAULT_AUTH_SECRET,
    DEFAULT_COOKIE_SECRET,
    DEFAULT_SESSION_SECRET,
    SecretsConfig,
} from "../src/config.defaults.js";

function fakeConfig(overrides: Partial<Record<"cookie_secret" | "auth:secret" | "session:secret", string>>): SecretsConfig {
    const values: Record<string, string> = {
        cookie_secret: DEFAULT_COOKIE_SECRET,
        "auth:secret": DEFAULT_AUTH_SECRET,
        "session:secret": DEFAULT_SESSION_SECRET,
        ...overrides,
    };
    return { get: (key: string) => values[key] };
}

describe("assertProductionSecretsAreSet", () => {
    it("is a no-op outside production, even with every default secret still in effect", () => {
        expect(() => assertProductionSecretsAreSet(fakeConfig({}), "development")).not.toThrow();
        expect(() => assertProductionSecretsAreSet(fakeConfig({}), undefined)).not.toThrow();
    });

    it("throws in production when all three secrets still hold their default values", () => {
        expect(() => assertProductionSecretsAreSet(fakeConfig({}), "production")).toThrow(
            /COOKIE_SECRET, AUTH__SECRET, SESSION__SECRET/,
        );
    });

    it("throws naming only the specific secret(s) still at their default", () => {
        const config = fakeConfig({ "auth:secret": "a-real-unique-secret", "session:secret": "another-real-secret" });
        expect(() => assertProductionSecretsAreSet(config, "production")).toThrow(/^Refusing to start in production.*COOKIE_SECRET/);
    });

    it("does not throw in production once all three secrets have been overridden", () => {
        const config = fakeConfig({
            cookie_secret: "unique-cookie-secret",
            "auth:secret": "unique-auth-secret",
            "session:secret": "unique-session-secret",
        });
        expect(() => assertProductionSecretsAreSet(config, "production")).not.toThrow();
    });
});
