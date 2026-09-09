////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////

// The following re-exports needed model classes so that they are properly picked up by
// the ClassLoader (and ObjectFactory) during server startup
export { UserMongo, AliasMongo, ProfileMongo, SecretMongo } from "@rapidrest/auth/mongo";
export {
    AuthorizationCodeMongo,
    ClientMongo,
    ConsentGrantMongo,
    OAuthRefreshTokenMongo,
    SigningKeyMongo,
} from "@rapidrest/auth/mongo";
export { SiteSettingsMongo } from "../models/mongo/SiteSettingsMongo.js";
