///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import {
    getSmsSettings,
    getSmtpSettings,
    getWhatsAppSettings,
    listMessageTemplates,
    MessageTemplateSummary,
    SmsSettings,
    SmtpSettings,
    WhatsAppSettings,
} from "../../shared/lib/messagingApi.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import SmsCard from "../../shared/components/admin/messages/SmsCard.js";
import SmtpCard from "../../shared/components/admin/messages/SmtpCard.js";
import TemplateTable from "../../shared/components/admin/messages/TemplateTable.js";
import WhatsAppCard from "../../shared/components/admin/messages/WhatsAppCard.js";
import Alert from "../../shared/components/feedback/Alert.js";

interface MessagesPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

/**
 * The e-mails, text messages and WhatsApp messages this server sends, and how they go out: the SMTP server, the SMS
 * provider (Twilio or Telnyx), the WhatsApp Business credentials and the address/number each comes from. Edits are
 * stored in the database and used from the next message, so nothing here needs a redeploy. Wrapped in `AdminShell`
 * like every other admin page, which already gates its children behind the `admin` trusted role and a fresh
 * elevation — both the routes' `@RequiresTrustedRole()` requirements.
 */
export default function MessagesPage({ userUid, siteSettings }: MessagesPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="messages">
            <MessagesContent />
        </AdminShell>
    );
}

function MessagesContent() {
    const [templates, setTemplates] = useState<MessageTemplateSummary[] | null>(null);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
    const [smtpError, setSmtpError] = useState<string | null>(null);
    const [sms, setSms] = useState<SmsSettings | null>(null);
    const [smsError, setSmsError] = useState<string | null>(null);
    const [whatsApp, setWhatsApp] = useState<WhatsAppSettings | null>(null);
    const [whatsAppError, setWhatsAppError] = useState<string | null>(null);

    // Independent loads, so a problem with one never hides the other.
    useEffect(() => {
        listMessageTemplates()
            .then(setTemplates)
            .catch((err) => setTemplatesError(err instanceof ApiRequestError ? err.message : "Could not load the messages."));
        getSmtpSettings()
            .then(setSmtp)
            .catch((err) => setSmtpError(err instanceof ApiRequestError ? err.message : "Could not load the e-mail settings."));
        getSmsSettings()
            .then(setSms)
            .catch((err) => setSmsError(err instanceof ApiRequestError ? err.message : "Could not load the text message settings."));
        getWhatsAppSettings()
            .then(setWhatsApp)
            .catch((err) => setWhatsAppError(err instanceof ApiRequestError ? err.message : "Could not load the WhatsApp settings."));
    }, []);

    return (
        <>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.01em" }}>E-mail, text &amp; WhatsApp messages</h1>
                <p className="rr-hint">
                    The e-mails, text messages and WhatsApp messages this server sends, and how they go out. Edit any of it here
                    and it&rsquo;s used from the next message on, with no redeploy. Messages use your site branding by default.
                </p>
            </div>

            {smtpError && <Alert>{smtpError}</Alert>}
            {smtp && <SmtpCard settings={smtp} onUpdated={setSmtp} />}
            {smsError && <Alert>{smsError}</Alert>}
            {sms && <SmsCard settings={sms} onUpdated={setSms} />}
            {whatsAppError && <Alert>{whatsAppError}</Alert>}
            {whatsApp && <WhatsAppCard settings={whatsApp} onUpdated={setWhatsApp} />}

            <div className="rr-card">
                <div className="rr-card__title">Templates</div>
                {templatesError && <Alert>{templatesError}</Alert>}
                {!templates && !templatesError && <p className="rr-hint">Loading&hellip;</p>}
                {templates && <TemplateTable templates={templates} />}
            </div>
        </>
    );
}
