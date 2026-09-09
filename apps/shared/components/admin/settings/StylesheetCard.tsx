///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useRef, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { deleteSiteStylesheet, updateSiteSettings, uploadSiteStylesheet } from "../../../lib/adminApi.js";
import { PublicSiteSettings } from "../../../lib/siteSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface StylesheetCardProps {
    settings: PublicSiteSettings;
    onUpdated: (settings: PublicSiteSettings) => void;
}

/**
 * A custom stylesheet applied site-wide, supplied either as a reference URL or a directly uploaded
 * `.css` file — same "upload takes precedence" convention as `BrandingCard`'s logo (see
 * `effectiveStylesheetUrl()`).
 */
export default function StylesheetCard({ settings, onUpdated }: StylesheetCardProps) {
    const [stylesheetUrl, setStylesheetUrl] = useState(settings.stylesheetUrl ?? "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateSiteSettings({ stylesheetUrl: stylesheetUrl || null });
            onUpdated(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setError(null);
        setUploading(true);
        try {
            onUpdated(await uploadSiteStylesheet(file));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not upload this stylesheet.");
        } finally {
            setUploading(false);
        }
    }

    async function handleRemoveUploaded() {
        setError(null);
        setUploading(true);
        try {
            onUpdated(await deleteSiteStylesheet());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove this stylesheet.");
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Custom stylesheet</div>
            <p className="rr-card__subtitle">Additional CSS loaded on every www and admin console page.</p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="settingsStylesheetUrl">Stylesheet URL</label>
                <input
                    id="settingsStylesheetUrl"
                    className="rr-input"
                    type="text"
                    placeholder="https://example.com/style.css"
                    value={stylesheetUrl}
                    disabled={settings.stylesheetUploaded}
                    onChange={(e) => {
                        setStylesheetUrl(e.target.value);
                        setSaved(false);
                    }}
                />
                {settings.stylesheetUploaded && (
                    <p className="rr-hint">A directly uploaded stylesheet is active and takes precedence over this URL.</p>
                )}
            </div>

            <div className="rr-field">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="text/css,.css"
                    style={{ display: "none" }}
                    onChange={handleFileSelected}
                />
                <Button
                    type="button"
                    variant="secondary"
                    style={{ width: "auto" }}
                    loading={uploading}
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                >
                    Upload stylesheet
                </Button>
                {settings.stylesheetUploaded && (
                    <Button
                        type="button"
                        variant="text"
                        disabled={uploading}
                        onClick={handleRemoveUploaded}
                        style={{ marginLeft: "0.75rem" }}
                    >
                        Remove uploaded stylesheet
                    </Button>
                )}
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
