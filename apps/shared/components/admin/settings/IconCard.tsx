///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useRef, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { deleteSiteIcon, updateSiteSettings, uploadSiteIcon } from "../../../lib/adminApi.js";
import { effectiveIconUrl, PublicSiteSettings } from "../../../lib/siteSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface IconCardProps {
    settings: PublicSiteSettings;
    onUpdated: (settings: PublicSiteSettings) => void;
}

/**
 * The compact mark shown in navigation headers (`AdminShell`'s nav bar, the `/` splash screen) — a
 * reference URL or a directly uploaded image, independently configurable from `BrandingCard`'s full
 * logo. Same "upload takes precedence" convention as `BrandingCard`'s logo (see `effectiveIconUrl()`);
 * a deployment with no icon configured falls back to the logo, then to a default asset, at each of
 * those render sites rather than here.
 */
export default function IconCard({ settings, onUpdated }: IconCardProps) {
    const [iconUrl, setIconUrl] = useState(settings.iconUrl ?? "");
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
            const updated = await updateSiteSettings({ iconUrl: iconUrl || null });
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
            onUpdated(await uploadSiteIcon(file));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not upload this icon.");
        } finally {
            setUploading(false);
        }
    }

    async function handleRemoveUploaded() {
        setError(null);
        setUploading(true);
        try {
            onUpdated(await deleteSiteIcon());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove this icon.");
        } finally {
            setUploading(false);
        }
    }

    const previewSrc = effectiveIconUrl(settings);

    return (
        <div className="rr-card">
            <div className="rr-card__title">Icon</div>
            <p className="rr-card__subtitle">
                A compact mark shown in navigation headers, as opposed to the full logo above. Falls back to the
                logo, then a default asset, when not set.
            </p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="settingsIconUrl">Icon URL</label>
                <input
                    id="settingsIconUrl"
                    className="rr-input"
                    type="text"
                    placeholder="https://example.com/icon.png"
                    value={iconUrl}
                    disabled={settings.iconUploaded}
                    onChange={(e) => {
                        setIconUrl(e.target.value);
                        setSaved(false);
                    }}
                />
                {settings.iconUploaded && (
                    <p className="rr-hint">A directly uploaded icon is active and takes precedence over this URL.</p>
                )}
            </div>

            <div className="rr-field" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {previewSrc && (
                    <img
                        src={previewSrc}
                        alt="Icon preview"
                        style={{ maxWidth: "48px", maxHeight: "48px", objectFit: "contain" }}
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
                        Upload icon image
                    </Button>
                    {settings.iconUploaded && (
                        <Button
                            type="button"
                            variant="text"
                            disabled={uploading}
                            onClick={handleRemoveUploaded}
                            style={{ marginLeft: "0.75rem" }}
                        >
                            Remove uploaded icon
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
