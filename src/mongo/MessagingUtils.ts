///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import { MessageTemplateMongo } from "../models/mongo/MessageTemplateMongo.js";
import { MessagingSettingsMongo } from "../models/mongo/MessagingSettingsMongo.js";
import { SiteSettingsMongo } from "../models/mongo/SiteSettingsMongo.js";

/**
 * The `MessagingUtils` this server runs, storing template edits in mongo. See `BaseDatabaseMessagingUtils`.
 *
 * **The file's name is what makes it work.** `Server` registers every class it finds under this directory in
 * `ObjectFactory` by name, before anything is instantiated, and a default export takes its file's name — so this
 * one is registered as `MessagingUtils`, which is the name every `@Inject(MessagingUtils)` in `@rapidrest/auth`
 * resolves to. Renaming or moving it silently puts the stock `MessagingUtils` back (`BaseMessageTemplateRoute`
 * refuses to start if that happens).
 */
export default class DatabaseMessagingUtilsMongo extends BaseDatabaseMessagingUtils {
    protected templateClass = MessageTemplateMongo;
    protected settingsClass = SiteSettingsMongo;
    protected messagingSettingsClass = MessagingSettingsMongo;
}
