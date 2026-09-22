///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { resetSmsSettings, SmsProvider, SmsSettings, SmsSettingsInput, updateSmsSettings } from "../../../lib/messagingApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";

export interface SmsCardProps {
    settings: SmsSettings;
    onUpdated: (settings: SmsSettings) => void;
}

/** The providers text messages can be sent through, as they're named to people. */
const PROVIDER_LABELS: Record<SmsProvider, string> = { twilio: "Twilio", telnyx: "Telnyx" };

/** The provider shown before one has been chosen (and the one a deployment from before there was a choice uses). */
const DEFAULT_PROVIDER: SmsProvider = "twilio";

/**
 * Which provider sends text messages, its credentials, and the sender they come from. Twilio and Telnyx are supported,
 * one at a time: the selector decides which provider's fields are shown and, on save, which one sends. Switching
 * keeps the other provider's saved credentials, but they play no part until it's switched back. They were set from
 * this deployment's configuration the first time the server started, and what's saved here takes over from then
 * on — used from the very next message, with no restart. The auth token and API key are write-only: they're stored
 * encrypted and never shown again, so a blank secret field means "keep the one that's saved" — it is never pre-filled.
 */
export default function SmsCard({ settings, onUpdated }: SmsCardProps) {
    const [provider, setProvider] = useState<SmsProvider>(settings.provider ?? DEFAULT_PROVIDER);
    const [accountSid, setAccountSid] = useState(settings.twilio.accountSid ?? "");
    const [token, setToken] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [profileId, setProfileId] = useState(settings.telnyx.messagingProfileId ?? "");
    const [from, setFrom] = useState(settings.from ?? "");
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const providerChanged = provider !== (settings.provider ?? DEFAULT_PROVIDER);
    const sidChanged = accountSid.trim() !== (settings.twilio.accountSid ?? "");
    const profileChanged = profileId.trim() !== (settings.telnyx.messagingProfileId ?? "");
    const fromChanged = from.trim() !== (settings.from ?? "");
    // Only the selected provider's fields count: the other's are hidden, and aren't sent.
    const credentialsChanged = provider === "twilio" ? sidChanged || !!token : profileChanged || !!apiKey;
    const hasSavedCredentials =
        provider === "twilio"
            ? !!settings.twilio.accountSid || settings.twilio.tokenSet
            : settings.telnyx.apiKeySet || !!settings.telnyx.messagingProfileId;
    const providerLabel = PROVIDER_LABELS[provider];

    /** Shows the settings as the server now has them. A removal keeps whichever provider is selected, saved or not. */
    function applyServerSettings(updated: SmsSettings, keepProvider = false) {
        if (!keepProvider) {
            setProvider(updated.provider ?? DEFAULT_PROVIDER);
        }
        setAccountSid(updated.twilio.accountSid ?? "");
        setProfileId(updated.telnyx.messagingProfileId ?? "");
        setFrom(updated.from ?? "");
        setToken("");
        setApiKey("");
        onUpdated(updated);
    }

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        // The selected provider, and only what changed for it. A blank secret field means "keep it" — so it's left out, not sent as null.
        const input: SmsSettingsInput = { provider };
        if (fromChanged) input.from = from.trim() || null;
        if (provider === "twilio") {
            const twilio: NonNullable<SmsSettingsInput["twilio"]> = {};
            if (sidChanged) twilio.accountSid = accountSid.trim() || null;
            if (token) twilio.token = token;
            if (Object.keys(twilio).length > 0) input.twilio = twilio;
        } else {
            const telnyx: NonNullable<SmsSettingsInput["telnyx"]> = {};
            if (profileChanged) telnyx.messagingProfileId = profileId.trim() || null;
            if (apiKey) telnyx.apiKey = apiKey;
            if (Object.keys(telnyx).length > 0) input.telnyx = telnyx;
        }
        try {
            applyServerSettings(await updateSmsSettings(input));
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove() {
        if (
            !window.confirm(
                `Remove the saved ${providerLabel} credentials? Text messages can't be sent through ${providerLabel} until new ones are saved.`,
            )
        ) {
            return;
        }
        setError(null);
        setSaved(false);
        setRemoving(true);
        try {
            // Only the selected provider's credentials, and not the sender or the choice of provider.
            const input: SmsSettingsInput =
                provider === "twilio"
                    ? { twilio: { accountSid: null, token: null } }
                    : { telnyx: { apiKey: null, messagingProfileId: null } };
            applyServerSettings(await updateSmsSettings(input), true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove these credentials.");
        } finally {
            setRemoving(false);
        }
    }

    async function handleReset() {
        if (
            !window.confirm(
                "Replace the saved text message settings with the ones in this deployment's configuration? Anything you've changed " +
                    "here is lost, and any the configuration doesn't have is cleared.",
            )
        ) {
            return;
        }
        setError(null);
        setSaved(false);
        setResetting(true);
        try {
            applyServerSettings(await resetSmsSettings());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset these settings.");
        } finally {
            setResetting(false);
        }
    }

    const busy = saving || removing || resetting;

    return (
        <div className="rr-card">
            <div className="rr-card__title">Text messages (SMS)</div>
            <p className="rr-card__subtitle">
                {settings.configured
                    ? "Text messages are sent with the provider, credentials and sender saved here."
                    : "Text messages can't be sent yet: a provider, its credentials and a sender are all needed."}
            </p>
            {error && <Alert>{error}</Alert>}

            <FormField label="Provider" htmlFor="smsProvider">
                <select
                    id="smsProvider"
                    className="rr-input"
                    value={provider}
                    onChange={(e) => {
                        setProvider(e.target.value as SmsProvider);
                        setSaved(false);
                    }}
                >
                    {(Object.keys(PROVIDER_LABELS) as SmsProvider[]).map((value) => (
                        <option key={value} value={value}>
                            {PROVIDER_LABELS[value]}
                        </option>
                    ))}
                </select>
                <p className="rr-hint">
                    Only one provider sends text messages at a time. Switching to the other keeps the credentials saved for this
                    one, but they aren&rsquo;t used until you switch back.
                </p>
            </FormField>

            {provider === "twilio" ? (
                <>
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
                            placeholder={settings.twilio.tokenSet ? "Saved — leave blank to keep it" : ""}
                            value={token}
                            onChange={(e) => {
                                setToken(e.target.value);
                                setSaved(false);
                            }}
                        />
                        <p className="rr-hint">Stored encrypted, and can&rsquo;t be viewed again once saved.</p>
                    </FormField>
                </>
            ) : (
                <>
                    <FormField label="API key" htmlFor="telnyxApiKey">
                        <input
                            id="telnyxApiKey"
                            className="rr-input"
                            type="password"
                            autoComplete="new-password"
                            placeholder={settings.telnyx.apiKeySet ? "Saved — leave blank to keep it" : ""}
                            value={apiKey}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                setSaved(false);
                            }}
                        />
                        <p className="rr-hint">Stored encrypted, and can&rsquo;t be viewed again once saved.</p>
                    </FormField>

                    <FormField label="Messaging profile ID" htmlFor="telnyxMessagingProfileId">
                        <input
                            id="telnyxMessagingProfileId"
                            className="rr-input"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            style={{ fontFamily: "monospace" }}
                            value={profileId}
                            onChange={(e) => {
                                setProfileId(e.target.value);
                                setSaved(false);
                            }}
                        />
                        <p className="rr-hint">Optional. Sends the texts through that messaging profile rather than the account&rsquo;s default.</p>
                    </FormField>
                </>
            )}

            <FormField label="Send from" htmlFor="smsFrom">
                <input
                    id="smsFrom"
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
                    characters. It&rsquo;s used whichever provider sends the texts.
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
                    disabled={busy || (!providerChanged && !fromChanged && !credentialsChanged)}
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
