////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////
/**
 * `Server.start()` builds its data-model list purely from `ClassLoader`'s file scan of `src/mongo` (see
 * `@rapidrest/service-core`'s `Server.js`: "Scanning for data models..." walks each scanned *file's* own
 * exports for anything carrying `@DataStore` metadata — it does not follow imports into `node_modules`).
 * None of `routes/*.ts` re-export the `@rapidrest/auth` model classes they use (they only export their own
 * thin route subclass), so `UserMongo`/`AliasMongo`/`ProfileMongo`/`SecretMongo` were never actually
 * registered with the Mongo connection — every query against them fails with "No metadata for '<Class>'
 * was found." Re-exporting them from a file under `src/mongo` is enough for the scan to pick them up; the
 * export's local name doesn't matter, only that the class object (with its own `@DataStore` decorator
 * metadata) passes through here.
 */
export { UserMongo, AliasMongo, ProfileMongo, SecretMongo } from "@rapidrest/auth/mongo";
