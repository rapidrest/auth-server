///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import {
    assertProductionSecretsAreSet,
    DEFAULT_AUTH_SECRET,
    DEFAULT_COOKIE_SECRET,
    DEFAULT_OIDC_CLIENT_ID,
    DEFAULT_OIDC_CLIENT_SECRET,
    DEFAULT_SESSION_SECRET,
    SecretsConfig,
} from "../src/config.defaults.js";

type FakeConfigKey =
    | "cookie_secret"
    | "auth:secret"
    | "session:secret"
    | "auth:oidc:clientID"
    | "auth:oidc:clientSecret";

function fakeConfig(overrides: Partial<Record<FakeConfigKey, string>>): SecretsConfig {
    const values: Record<string, string> = {
        cookie_secret: DEFAULT_COOKIE_SECRET,
        "auth:secret": DEFAULT_AUTH_SECRET,
        "session:secret": DEFAULT_SESSION_SECRET,
        "auth:oidc:clientID": DEFAULT_OIDC_CLIENT_ID,
        "auth:oidc:clientSecret": DEFAULT_OIDC_CLIENT_SECRET,
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

    describe("OIDC placeholder credentials", () => {
        const overriddenSecrets = {
            cookie_secret: "unique-cookie-secret",
            "auth:secret": "unique-auth-secret",
            "session:secret": "unique-session-secret",
        };

        it("warns (but does not throw) in production when the placeholder OIDC credentials are still in effect", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const config = fakeConfig(overriddenSecrets);
            expect(() => assertProductionSecretsAreSet(config, "production")).not.toThrow();
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/AUTH__OIDC__CLIENTID, AUTH__OIDC__CLIENTSECRET/),
            );
        });

        it("names only the specific OIDC placeholder(s) still at their default", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const config = fakeConfig({ ...overriddenSecrets, "auth:oidc:clientID": "a-real-client-id" });
            assertProductionSecretsAreSet(config, "production");
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^WARNING:.*AUTH__OIDC__CLIENTSECRET/));
            expect(warn.mock.calls[0][0]).not.toMatch(/AUTH__OIDC__CLIENTID\b/);
        });

        it("does not warn once both OIDC credentials have been overridden", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const config = fakeConfig({
                ...overriddenSecrets,
                "auth:oidc:clientID": "a-real-client-id",
                "auth:oidc:clientSecret": "a-real-client-secret",
            });
            assertProductionSecretsAreSet(config, "production");
            expect(warn).not.toHaveBeenCalled();
        });

        it("does not warn outside production even with the placeholder credentials still in effect", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            assertProductionSecretsAreSet(fakeConfig({}), "development");
            expect(warn).not.toHaveBeenCalled();
        });
    });
});
