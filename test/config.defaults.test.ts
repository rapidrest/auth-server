///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2020-2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import {
    assertProductionSecretsAreSet,
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_APPLE_KEY_ID,
    DEFAULT_APPLE_PRIVATE_KEY,
    DEFAULT_APPLE_TEAM_ID,
    DEFAULT_AUTH_SECRET,
    DEFAULT_COOKIE_SECRET,
    DEFAULT_FACEBOOK_CLIENT_ID,
    DEFAULT_FACEBOOK_CLIENT_SECRET,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_GOOGLE_CLIENT_SECRET,
    DEFAULT_MICROSOFT_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_SECRET,
    DEFAULT_MICROSOFT_TENANT,
    DEFAULT_SESSION_SECRET,
    SecretsConfig,
} from "../src/config.defaults.js";

type FakeConfigKey =
    | "cookie_secret"
    | "auth:secret"
    | "session:secret"
    | "auth:google:clientID"
    | "auth:google:clientSecret"
    | "auth:microsoft:clientID"
    | "auth:microsoft:clientSecret"
    | "auth:microsoft:tenant"
    | "auth:apple:clientID"
    | "auth:apple:teamId"
    | "auth:apple:keyId"
    | "auth:apple:privateKey"
    | "auth:facebook:clientID"
    | "auth:facebook:clientSecret";

function fakeConfig(overrides: Partial<Record<FakeConfigKey, string>>): SecretsConfig {
    const values: Record<string, string> = {
        cookie_secret: DEFAULT_COOKIE_SECRET,
        "auth:secret": DEFAULT_AUTH_SECRET,
        "session:secret": DEFAULT_SESSION_SECRET,
        "auth:google:clientID": DEFAULT_GOOGLE_CLIENT_ID,
        "auth:google:clientSecret": DEFAULT_GOOGLE_CLIENT_SECRET,
        "auth:microsoft:clientID": DEFAULT_MICROSOFT_CLIENT_ID,
        "auth:microsoft:clientSecret": DEFAULT_MICROSOFT_CLIENT_SECRET,
        "auth:microsoft:tenant": DEFAULT_MICROSOFT_TENANT,
        "auth:apple:clientID": DEFAULT_APPLE_CLIENT_ID,
        "auth:apple:teamId": DEFAULT_APPLE_TEAM_ID,
        "auth:apple:keyId": DEFAULT_APPLE_KEY_ID,
        "auth:apple:privateKey": DEFAULT_APPLE_PRIVATE_KEY,
        "auth:facebook:clientID": DEFAULT_FACEBOOK_CLIENT_ID,
        "auth:facebook:clientSecret": DEFAULT_FACEBOOK_CLIENT_SECRET,
        ...overrides,
    };
    return { get: (key: string) => values[key] };
}

const allProviderOverrides: Partial<Record<FakeConfigKey, string>> = {
    "auth:google:clientID": "a-real-client-id",
    "auth:google:clientSecret": "a-real-client-secret",
    "auth:microsoft:clientID": "a-real-client-id",
    "auth:microsoft:clientSecret": "a-real-client-secret",
    "auth:microsoft:tenant": "11111111-1111-1111-1111-111111111111",
    "auth:apple:clientID": "a-real-client-id",
    "auth:apple:teamId": "a-real-team-id",
    "auth:apple:keyId": "a-real-key-id",
    "auth:apple:privateKey": "a-real-private-key",
    "auth:facebook:clientID": "a-real-client-id",
    "auth:facebook:clientSecret": "a-real-client-secret",
};

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

    describe("OAuth/OIDC provider placeholder credentials", () => {
        const overriddenSecrets = {
            cookie_secret: "unique-cookie-secret",
            "auth:secret": "unique-auth-secret",
            "session:secret": "unique-session-secret",
        };

        it("warns (but does not throw) in production when the placeholder provider credentials are still in effect", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const config = fakeConfig(overriddenSecrets);
            expect(() => assertProductionSecretsAreSet(config, "production")).not.toThrow();
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(
                    /AUTH__GOOGLE__CLIENTID, AUTH__GOOGLE__CLIENTSECRET, AUTH__MICROSOFT__CLIENTID, AUTH__MICROSOFT__CLIENTSECRET, AUTH__MICROSOFT__TENANT, AUTH__APPLE__CLIENTID, AUTH__APPLE__TEAMID, AUTH__APPLE__KEYID, AUTH__APPLE__PRIVATEKEY, AUTH__FACEBOOK__CLIENTID, AUTH__FACEBOOK__CLIENTSECRET/,
                ),
            );
        });

        it("names only the specific placeholder(s) still at their default", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const config = fakeConfig({ ...overriddenSecrets, ...allProviderOverrides, "auth:google:clientID": DEFAULT_GOOGLE_CLIENT_ID });
            assertProductionSecretsAreSet(config, "production");
            expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^WARNING:.*AUTH__GOOGLE__CLIENTID\b/));
            expect(warn.mock.calls[0][0]).not.toMatch(/AUTH__GOOGLE__CLIENTSECRET\b/);
            expect(warn.mock.calls[0][0]).not.toMatch(/AUTH__MICROSOFT__/);
            expect(warn.mock.calls[0][0]).not.toMatch(/AUTH__APPLE__/);
            expect(warn.mock.calls[0][0]).not.toMatch(/AUTH__FACEBOOK__/);
        });

        it("does not warn once every provider's credentials have been overridden", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const config = fakeConfig({ ...overriddenSecrets, ...allProviderOverrides });
            assertProductionSecretsAreSet(config, "production");
            expect(warn).not.toHaveBeenCalled();
        });

        it("does not warn outside production even with the placeholder credentials still in effect", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            assertProductionSecretsAreSet(fakeConfig({}), "development");
            expect(warn).not.toHaveBeenCalled();
        });
    });
});
