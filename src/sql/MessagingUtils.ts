///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import { BaseDatabaseMessagingUtils } from "../messaging/BaseDatabaseMessagingUtils.js";
import { MessageTemplateSQL } from "../models/sql/MessageTemplateSQL.js";
import { MessagingSettingsSQL } from "../models/sql/MessagingSettingsSQL.js";
import { SiteSettingsSQL } from "../models/sql/SiteSettingsSQL.js";

/**
 * The `MessagingUtils` this server runs, storing template edits in sql. See `BaseDatabaseMessagingUtils`.
 *
 * **The file's name is what makes it work.** `Server` registers every class it finds under this directory in
 * `ObjectFactory` by name, before anything is instantiated, and a default export takes its file's name — so this
 * one is registered as `MessagingUtils`, which is the name every `@Inject(MessagingUtils)` in `@rapidrest/auth`
 * resolves to. Renaming or moving it silently puts the stock `MessagingUtils` back (`BaseMessageTemplateRoute`
 * refuses to start if that happens).
 */
export default class DatabaseMessagingUtilsSQL extends BaseDatabaseMessagingUtils {
    protected templateClass = MessageTemplateSQL;
    protected settingsClass = SiteSettingsSQL;
    protected messagingSettingsClass = MessagingSettingsSQL;
}
