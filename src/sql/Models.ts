////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////

// The following re-exports needed model classes so that they are properly picked up by
// the ClassLoader (and ObjectFactory) during server startup
export { UserSQL, AliasSQL, ProfileSQL, SecretSQL, SystemSettingsSQL } from "@rapidrest/auth/sql";
export {
    AuthorizationCodeSQL,
    ClientSQL,
    ConsentGrantSQL,
    OAuthRefreshTokenSQL,
    SigningKeySQL,
} from "@rapidrest/auth/sql";
export { SiteSettingsSQL } from "../models/sql/SiteSettingsSQL.js";
