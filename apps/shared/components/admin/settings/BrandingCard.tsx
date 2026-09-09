///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useRef, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { deleteSiteLogo, updateSiteSettings, uploadSiteLogo } from "../../../lib/adminApi.js";
import { effectiveLogoUrl, PublicSiteSettings } from "../../../lib/siteSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface BrandingCardProps {
    settings: PublicSiteSettings;
    onUpdated: (settings: PublicSiteSettings) => void;
}

/**
 * Site title, company name, and logo (a reference URL or a directly uploaded image — see
 * `effectiveLogoUrl()`'s doc comment for how the two interact). Text fields are edited locally and
 * saved together via one button; the logo's upload/remove actions apply immediately, matching
 * `ClientSecretCard`'s convention for an action with its own irreversible-ish server round trip.
 */
export default function BrandingCard({ settings, onUpdated }: BrandingCardProps) {
    const [siteTitle, setSiteTitle] = useState(settings.siteTitle ?? "");
    const [companyName, setCompanyName] = useState(settings.companyName ?? "");
    const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");
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
            const updated = await updateSiteSettings({
                siteTitle: siteTitle || null,
                companyName: companyName || null,
                logoUrl: logoUrl || null,
            });
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
            onUpdated(await uploadSiteLogo(file));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not upload this logo.");
        } finally {
            setUploading(false);
        }
    }

    async function handleRemoveUploaded() {
        setError(null);
        setUploading(true);
        try {
            onUpdated(await deleteSiteLogo());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove this logo.");
        } finally {
            setUploading(false);
        }
    }

    const previewSrc = effectiveLogoUrl(settings);

    return (
        <div className="rr-card">
            <div className="rr-card__title">Branding</div>
            <p className="rr-card__subtitle">Site title, company name, and logo shown across the www and admin console.</p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="settingsSiteTitle">Site title</label>
                <input
                    id="settingsSiteTitle"
                    className="rr-input"
                    type="text"
                    placeholder="RapidREST"
                    value={siteTitle}
                    onChange={(e) => {
                        setSiteTitle(e.target.value);
                        setSaved(false);
                    }}
                />
            </div>

            <div className="rr-field">
                <label htmlFor="settingsCompanyName">Company name</label>
                <input
                    id="settingsCompanyName"
                    className="rr-input"
                    type="text"
                    value={companyName}
                    onChange={(e) => {
                        setCompanyName(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">Shown in place of the site title where present (page title, headers).</p>
            </div>

            <div className="rr-field">
                <label htmlFor="settingsLogoUrl">Logo URL</label>
                <input
                    id="settingsLogoUrl"
                    className="rr-input"
                    type="text"
                    placeholder="https://example.com/logo.png"
                    value={logoUrl}
                    disabled={settings.logoUploaded}
                    onChange={(e) => {
                        setLogoUrl(e.target.value);
                        setSaved(false);
                    }}
                />
                {settings.logoUploaded && (
                    <p className="rr-hint">A directly uploaded logo is active and takes precedence over this URL.</p>
                )}
            </div>

            <div className="rr-field" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {previewSrc && (
                    <img
                        src={previewSrc}
                        alt="Logo preview"
                        style={{ maxWidth: "96px", maxHeight: "96px", objectFit: "contain" }}
                    />
                )}
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
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
                        Upload logo image
                    </Button>
                    {settings.logoUploaded && (
                        <Button
                            type="button"
                            variant="text"
                            disabled={uploading}
                            onClick={handleRemoveUploaded}
                            style={{ marginLeft: "0.75rem" }}
                        >
                            Remove uploaded logo
                        </Button>
                    )}
                </div>
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
