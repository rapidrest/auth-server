///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import {
    resetWhatsAppSettings,
    updateWhatsAppSettings,
    WhatsAppSettings,
    WhatsAppSettingsInput,
} from "../../../lib/messagingApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";

export interface WhatsAppCardProps {
    settings: WhatsAppSettings;
    onUpdated: (settings: WhatsAppSettings) => void;
}

/**
 * The WhatsApp Business phone number ID, access token and API version WhatsApp messages are sent with. They were set from
 * this deployment's configuration the first time the server started, and what's saved here takes over from then on —
 * used from the very next message, with no restart. The access token is write-only: it's stored encrypted and never
 * shown again, so a blank token field means "keep the one that's saved" — it is never pre-filled.
 */
export default function WhatsAppCard({ settings, onUpdated }: WhatsAppCardProps) {
    const [phoneNumberId, setPhoneNumberId] = useState(settings.phoneNumberId ?? "");
    const [accessToken, setAccessToken] = useState("");
    const [apiVersion, setApiVersion] = useState(settings.apiVersion ?? "");
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const idChanged = phoneNumberId.trim() !== (settings.phoneNumberId ?? "");
    const versionChanged = apiVersion.trim() !== (settings.apiVersion ?? "");
    const hasSavedCredentials = !!settings.phoneNumberId || settings.accessTokenSet;

    function applyServerSettings(updated: WhatsAppSettings) {
        setPhoneNumberId(updated.phoneNumberId ?? "");
        setApiVersion(updated.apiVersion ?? "");
        setAccessToken("");
        onUpdated(updated);
    }

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        // Only what changed, and a blank token field means "keep it" — so it's left out, not sent as null.
        const input: WhatsAppSettingsInput = {};
        if (idChanged) input.phoneNumberId = phoneNumberId.trim() || null;
        if (versionChanged) input.apiVersion = apiVersion.trim() || null;
        if (accessToken) input.accessToken = accessToken;
        try {
            applyServerSettings(await updateWhatsAppSettings(input));
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove() {
        if (!window.confirm("Remove the saved WhatsApp credentials? WhatsApp messages will stop until new ones are saved.")) {
            return;
        }
        setError(null);
        setSaved(false);
        setRemoving(true);
        try {
            applyServerSettings(await updateWhatsAppSettings({ phoneNumberId: null, accessToken: null }));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove these credentials.");
        } finally {
            setRemoving(false);
        }
    }

    async function handleReset() {
        if (
            !window.confirm(
                "Replace the saved WhatsApp settings with the ones in this deployment's configuration? Anything you've changed here " +
                    "is lost, and any the configuration doesn't have is cleared.",
            )
        ) {
            return;
        }
        setError(null);
        setSaved(false);
        setResetting(true);
        try {
            applyServerSettings(await resetWhatsAppSettings());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset these settings.");
        } finally {
            setResetting(false);
        }
    }

    const busy = saving || removing || resetting;

    return (
        <div className="rr-card">
            <div className="rr-card__title">WhatsApp</div>
            <p className="rr-card__subtitle">
                {settings.configured
                    ? "WhatsApp messages are sent with the phone number and access token saved here."
                    : "WhatsApp messages can't be sent yet: a phone number ID and an access token are both needed."}
            </p>
            {error && <Alert>{error}</Alert>}

            <FormField label="Phone number ID" htmlFor="whatsappPhoneNumberId">
                <input
                    id="whatsappPhoneNumberId"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    inputMode="numeric"
                    style={{ fontFamily: "monospace" }}
                    value={phoneNumberId}
                    onChange={(e) => {
                        setPhoneNumberId(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">
                    The ID Meta gives your WhatsApp Business phone number, shown under API setup in your Meta app&rsquo;s WhatsApp
                    settings. It&rsquo;s a long number, and isn&rsquo;t the phone number itself.
                </p>
            </FormField>

            <FormField label="Access token" htmlFor="whatsappAccessToken">
                <input
                    id="whatsappAccessToken"
                    className="rr-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={settings.accessTokenSet ? "Saved — leave blank to keep it" : ""}
                    value={accessToken}
                    onChange={(e) => {
                        setAccessToken(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">Stored encrypted, and can&rsquo;t be viewed again once saved.</p>
            </FormField>

            <FormField label="API version" htmlFor="whatsappApiVersion">
                <input
                    id="whatsappApiVersion"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="v23.0"
                    value={apiVersion}
                    onChange={(e) => {
                        setApiVersion(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">Optional. Leave blank for the default.</p>
            </FormField>

            <p className="rr-hint">
                WhatsApp only delivers a free-form message to someone who has messaged you in the last 24 hours. To send a code
                to anyone else, such as someone signing in, set an approved WhatsApp message template on that message&rsquo;s
                page under Templates.
            </p>
            <p className="rr-hint">
                These were set from this deployment&rsquo;s configuration the first time the server started. What you save here
                takes over from then on; &ldquo;Reset to configuration&rdquo; replaces it with what the configuration says now.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <Button
                    type="button"
                    onClick={handleSave}
                    loading={saving}
                    disabled={busy || (!idChanged && !versionChanged && !accessToken)}
                    style={{ width: "auto" }}
                >
                    Save
                </Button>
                {hasSavedCredentials && (
                    <Button
                        variant="secondary"
                        type="button"
                        onClick={handleRemove}
                        loading={removing}
                        disabled={busy}
                        style={{ width: "auto" }}
                    >
                        Remove saved credentials
                    </Button>
                )}
                <Button
                    variant="secondary"
                    type="button"
                    onClick={handleReset}
                    loading={resetting}
                    disabled={busy}
                    style={{ width: "auto" }}
                >
                    Reset to configuration
                </Button>
                {saved && <span className="rr-hint">Saved.</span>}
            </div>
        </div>
    );
}
