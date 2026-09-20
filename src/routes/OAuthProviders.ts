///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import {
    DEFAULT_APPLE_CLIENT_ID,
    DEFAULT_FACEBOOK_CLIENT_ID,
    DEFAULT_GOOGLE_CLIENT_ID,
    DEFAULT_MICROSOFT_CLIENT_ID,
} from "../config.defaults.js";

/** The configured `clientID` of each built-in OAuth provider, as read from `auth.<provider>.clientID`. */
export interface OAuthClientIDs {
    google?: unknown;
    microsoft?: unknown;
    apple?: unknown;
    facebook?: unknown;
}

/** The placeholder `clientID` each provider's shipped config points at (see `config.defaults.ts`). */
const PLACEHOLDER_CLIENT_IDS: Record<keyof OAuthClientIDs, string> = {
    google: DEFAULT_GOOGLE_CLIENT_ID,
    microsoft: DEFAULT_MICROSOFT_CLIENT_ID,
    apple: DEFAULT_APPLE_CLIENT_ID,
    facebook: DEFAULT_FACEBOOK_CLIENT_ID,
};

/**
 * The ids of the built-in OAuth providers whose `clientID` an operator has replaced, for the sign-in page to
 * show a "Continue with ..." button for.
 *
 * A provider still on its shipped placeholder `clientID` (or with none at all) can't complete a real
 * sign-in — its button would only ever end in the provider's own "unknown app" error page — so it's left
 * out rather than shown. Only the `clientID` is compared, the same value `assertProductionSecretsAreSet()`
 * uses to recognize an unconfigured provider; the provider's secret/key material is never sent to a page.
 */
export function toEnabledOAuthProviders(clientIDs: OAuthClientIDs): string[] {
    return (Object.keys(PLACEHOLDER_CLIENT_IDS) as Array<keyof OAuthClientIDs>).filter((provider) => {
        const clientID = clientIDs[provider];
        return typeof clientID === "string" && clientID.trim() !== "" && clientID !== PLACEHOLDER_CLIENT_IDS[provider];
    });
}
