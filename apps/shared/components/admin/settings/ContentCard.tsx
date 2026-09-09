///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { updateSiteSettings } from "../../../lib/adminApi.js";
import { PublicSiteSettings } from "../../../lib/siteSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface ContentCardProps {
    settings: PublicSiteSettings;
    onUpdated: (settings: PublicSiteSettings) => void;
}

/**
 * Custom header/footer HTML rendered around every www/admin page (see `AuthShell`/`AdminShell`). This
 * is raw HTML, not sanitized — a deliberate choice: it's only ever reachable by a trusted-role admin
 * (server-enforced via `@RequiresTrustedRole()`, same as every other write in this file's API), the
 * same trust boundary as a custom-code block in any CMS admin panel.
 */
export default function ContentCard({ settings, onUpdated }: ContentCardProps) {
    const [headerHtml, setHeaderHtml] = useState(settings.headerHtml ?? "");
    const [footerHtml, setFooterHtml] = useState(settings.footerHtml ?? "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateSiteSettings({
                headerHtml: headerHtml || null,
                footerHtml: footerHtml || null,
            });
            onUpdated(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Header &amp; footer</div>
            <p className="rr-card__subtitle">
                Custom HTML rendered above and below the main content on every www and admin console page.
            </p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="settingsHeaderHtml">Header HTML</label>
                <textarea
                    id="settingsHeaderHtml"
                    className="rr-input"
                    rows={4}
                    value={headerHtml}
                    onChange={(e) => {
                        setHeaderHtml(e.target.value);
                        setSaved(false);
                    }}
                />
            </div>

            <div className="rr-field">
                <label htmlFor="settingsFooterHtml">Footer HTML</label>
                <textarea
                    id="settingsFooterHtml"
                    className="rr-input"
                    rows={4}
                    value={footerHtml}
                    onChange={(e) => {
                        setFooterHtml(e.target.value);
                        setSaved(false);
                    }}
                />
            </div>

            <Button type="button" onClick={handleSave} loading={saving} disabled={saving} style={{ width: "auto" }}>
                Save
            </Button>
            {saved && (
                <span className="rr-hint" style={{ marginLeft: "0.75rem" }}>
                    Saved.
                </span>
            )}
        </div>
    );
}
