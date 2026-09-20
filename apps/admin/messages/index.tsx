///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import {
    getSmtpSettings,
    getTwilioSettings,
    listMessageTemplates,
    MessageTemplateSummary,
    SmtpSettings,
    TwilioSettings,
} from "../../shared/lib/messagingApi.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import SmtpCard from "../../shared/components/admin/messages/SmtpCard.js";
import TemplateTable from "../../shared/components/admin/messages/TemplateTable.js";
import TwilioCard from "../../shared/components/admin/messages/TwilioCard.js";
import Alert from "../../shared/components/feedback/Alert.js";

interface MessagesPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

/**
 * The e-mails and text messages this server sends, and how they go out: the SMTP server, the Twilio credentials and
 * the address/number each comes from. Edits are stored in the database and used from the next message, so nothing here
 * needs a redeploy. Wrapped in `AdminShell`
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
    const [twilio, setTwilio] = useState<TwilioSettings | null>(null);
    const [twilioError, setTwilioError] = useState<string | null>(null);

    // Independent loads, so a problem with one never hides the other.
    useEffect(() => {
        listMessageTemplates()
            .then(setTemplates)
            .catch((err) => setTemplatesError(err instanceof ApiRequestError ? err.message : "Could not load the messages."));
        getSmtpSettings()
            .then(setSmtp)
            .catch((err) => setSmtpError(err instanceof ApiRequestError ? err.message : "Could not load the e-mail settings."));
        getTwilioSettings()
            .then(setTwilio)
            .catch((err) => setTwilioError(err instanceof ApiRequestError ? err.message : "Could not load the text message settings."));
    }, []);

    return (
        <>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.01em" }}>E-mail &amp; text messages</h1>
                <p className="rr-hint">
                    The e-mails and text messages this server sends, and how they go out. Edit any of it here and it&rsquo;s
                    used from the next message on, with no redeploy. Messages use your site branding by default.
                </p>
            </div>

            {smtpError && <Alert>{smtpError}</Alert>}
            {smtp && <SmtpCard settings={smtp} onUpdated={setSmtp} />}
            {twilioError && <Alert>{twilioError}</Alert>}
            {twilio && <TwilioCard settings={twilio} onUpdated={setTwilio} />}

            <div className="rr-card">
                <div className="rr-card__title">Templates</div>
                {templatesError && <Alert>{templatesError}</Alert>}
                {!templates && !templatesError && <p className="rr-hint">Loading&hellip;</p>}
                {templates && <TemplateTable templates={templates} />}
            </div>
        </>
    );
}
