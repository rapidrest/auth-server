///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../shared/lib/api.js";
import { getMessageTemplate, MessageTemplateDetail } from "../../shared/lib/messagingApi.js";
import { PublicSiteSettings } from "../../shared/lib/siteSettings.js";
import AdminShell from "../../shared/components/admin/layout/AdminShell.js";
import TemplateEditor from "../../shared/components/admin/messages/TemplateEditor.js";
import Alert from "../../shared/components/feedback/Alert.js";

interface MessagePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** The `:name` dynamic segment captured from this file's `[name].tsx` name — see `@rapidrest/react`'s
     * `ReactRoute` doc comment for the convention. Always present when this route matched. */
    params: { name: string };
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function MessagePage({ userUid, params, siteSettings }: MessagePageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="messages">
            <MessageContent name={params.name} />
        </AdminShell>
    );
}

function MessageContent({ name }: { name: string }) {
    const [template, setTemplate] = useState<MessageTemplateDetail | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getMessageTemplate(name)
            .then(setTemplate)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load this message."))
            .finally(() => setLoaded(true));
    }, [name]);

    return (
        <>
            <div style={{ marginBottom: "1rem" }}>
                <a href="/admin/messages">&larr; Back to messages</a>
            </div>
            {!loaded && <p className="rr-hint">Loading&hellip;</p>}
            {loaded && error && <Alert>{error}</Alert>}
            {loaded && template && <TemplateEditor template={template} onChanged={setTemplate} />}
        </>
    );
}
