///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { describe, expect, it } from "vitest";
import {
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_FACEBOOK_CLIENT_ID,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_ID,
} from "../src/config.defaults.js";
import { toEnabledOAuthProviders } from "../src/routes/OAuthProviders.js";

const PLACEHOLDERS = {
    google: DEFAULT_GOOGLE_CLIENT_ID,
    microsoft: DEFAULT_MICROSOFT_CLIENT_ID,
    apple: DEFAULT_APPLE_CLIENT_ID,
    facebook: DEFAULT_FACEBOOK_CLIENT_ID,
};

describe("toEnabledOAuthProviders()", () => {
    it("returns no providers when every clientID is still its shipped placeholder", () => {
        expect(toEnabledOAuthProviders(PLACEHOLDERS)).toEqual([]);
    });

    it("returns every provider once all four clientIDs are replaced", () => {
        expect(
            toEnabledOAuthProviders({
                google: "real-google.apps.googleusercontent.com",
                microsoft: "11111111-2222-3333-4444-555555555555",
                apple: "com.acme.signin",
                facebook: "9876543210",
            }),
        ).toEqual(["google", "microsoft", "apple", "facebook"]);
    });

    it.each(["google", "microsoft", "apple", "facebook"] as const)(
        "returns only %s when it is the one provider with a replaced clientID",
        (provider) => {
            expect(toEnabledOAuthProviders({ ...PLACEHOLDERS, [provider]: "replaced" })).toEqual([provider]);
        },
    );

    it("treats a missing, empty, blank or non-string clientID as not configured", () => {
        expect(toEnabledOAuthProviders({})).toEqual([]);
        expect(toEnabledOAuthProviders({ google: "", microsoft: "   ", apple: undefined, facebook: 12345 })).toEqual([]);
    });
});
