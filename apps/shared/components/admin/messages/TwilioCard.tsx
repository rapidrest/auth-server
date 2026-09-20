///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { resetTwilioSettings, TwilioSettings, TwilioSettingsInput, updateTwilioSettings } from "../../../lib/messagingApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";

export interface TwilioCardProps {
    settings: TwilioSettings;
    onUpdated: (settings: TwilioSettings) => void;
}

/**
 * The Twilio account SID, auth token and sender text messages are sent with. They were set from this deployment's
 * configuration the first time the server started, and what's saved here takes over from then on — used from the very
 * next message, with no restart. The token is write-only: it's stored encrypted and never shown again, so a blank
 * token field means "keep the one that's saved" — it is never pre-filled.
 */
export default function TwilioCard({ settings, onUpdated }: TwilioCardProps) {
    const [accountSid, setAccountSid] = useState(settings.accountSid ?? "");
    const [token, setToken] = useState("");
    const [from, setFrom] = useState(settings.from ?? "");
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sidChanged = accountSid.trim() !== (settings.accountSid ?? "");
    const fromChanged = from.trim() !== (settings.from ?? "");
    const hasSavedCredentials = !!settings.accountSid || settings.tokenSet;

    function applyServerSettings(updated: TwilioSettings) {
        setAccountSid(updated.accountSid ?? "");
        setFrom(updated.from ?? "");
        setToken("");
        onUpdated(updated);
    }

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        // Only what changed, and a blank token field means "keep it" — so it's left out, not sent as null.
        const input: TwilioSettingsInput = {};
        if (sidChanged) input.accountSid = accountSid.trim() || null;
        if (fromChanged) input.from = from.trim() || null;
        if (token) input.token = token;
        try {
            applyServerSettings(await updateTwilioSettings(input));
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove() {
        if (!window.confirm("Remove the saved Twilio credentials? Text messages will stop until new ones are saved.")) {
            return;
        }
        setError(null);
        setSaved(false);
        setRemoving(true);
        try {
            applyServerSettings(await updateTwilioSettings({ accountSid: null, token: null }));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove these credentials.");
        } finally {
            setRemoving(false);
        }
    }

    async function handleReset() {
        if (
            !window.confirm(
                "Replace the saved Twilio settings with the ones in this deployment's configuration? Anything you've changed here " +
                    "is lost, and any the configuration doesn't have is cleared.",
            )
        ) {
            return;
        }
        setError(null);
        setSaved(false);
        setResetting(true);
        try {
            applyServerSettings(await resetTwilioSettings());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset these settings.");
        } finally {
            setResetting(false);
        }
    }

    const busy = saving || removing || resetting;

    return (
        <div className="rr-card">
            <div className="rr-card__title">Text messages (Twilio)</div>
            <p className="rr-card__subtitle">
                {settings.configured
                    ? "Text messages are sent with the credentials and sender saved here."
                    : "Text messages can't be sent yet: an account SID, an auth token and a sender are all needed."}
            </p>
            {error && <Alert>{error}</Alert>}

            <FormField label="Account SID" htmlFor="twilioAccountSid">
                <input
                    id="twilioAccountSid"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="AC…"
                    style={{ fontFamily: "monospace" }}
                    value={accountSid}
                    onChange={(e) => {
                        setAccountSid(e.target.value);
                        setSaved(false);
                    }}
                />
            </FormField>

            <FormField label="Auth token" htmlFor="twilioToken">
                <input
                    id="twilioToken"
                    className="rr-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={settings.tokenSet ? "Saved — leave blank to keep it" : ""}
                    value={token}
                    onChange={(e) => {
                        setToken(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">Stored encrypted, and can&rsquo;t be viewed again once saved.</p>
            </FormField>

            <FormField label="Send from" htmlFor="twilioFrom">
                <input
                    id="twilioFrom"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="+15555550100"
                    value={from}
                    onChange={(e) => {
                        setFrom(e.target.value);
                        setSaved(false);
                    }}
                />
                <p className="rr-hint">
                    A phone number in international format, like +15555550100, or an alphanumeric sender ID of up to 11
                    characters.
                </p>
            </FormField>

            <p className="rr-hint">
                These were set from this deployment&rsquo;s configuration the first time the server started. What you save here
                takes over from then on; &ldquo;Reset to configuration&rdquo; replaces it with what the configuration says now.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <Button
                    type="button"
                    onClick={handleSave}
                    loading={saving}
                    disabled={busy || (!sidChanged && !fromChanged && !token)}
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
