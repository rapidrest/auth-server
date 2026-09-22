///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { resetSmtpSettings, SmtpSettings, SmtpSettingsInput, updateSmtpSettings } from "../../../lib/messagingApi.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";
import FormField from "../../forms/FormField.js";

export interface SmtpCardProps {
    settings: SmtpSettings;
    onUpdated: (settings: SmtpSettings) => void;
}

/**
 * The SMTP server and sender e-mail is sent with. As with the SMS card, they were set from this deployment's
 * configuration the first time the server started, and what's saved here takes over from then on — used from the very
 * next e-mail, with no restart. The password is write-only: stored encrypted, never shown again, so a blank password
 * field means "keep the one that's saved".
 */
export default function SmtpCard({ settings, onUpdated }: SmtpCardProps) {
    const [host, setHost] = useState(settings.host ?? "");
    const [port, setPort] = useState(settings.port === undefined ? "" : String(settings.port));
    const [secure, setSecure] = useState(settings.secure);
    const [user, setUser] = useState(settings.user ?? "");
    const [password, setPassword] = useState("");
    const [from, setFrom] = useState(settings.from ?? "");
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hostChanged = host.trim() !== (settings.host ?? "");
    const portChanged = port.trim() !== (settings.port === undefined ? "" : String(settings.port));
    const secureChanged = secure !== settings.secure;
    const userChanged = user.trim() !== (settings.user ?? "");
    const fromChanged = from.trim() !== (settings.from ?? "");
    const anythingChanged = hostChanged || portChanged || secureChanged || userChanged || fromChanged || !!password;
    const hasSavedCredentials = !!settings.user || settings.passwordSet;

    function edited<T>(set: (value: T) => void, value: T) {
        set(value);
        setSaved(false);
    }

    function applyServerSettings(updated: SmtpSettings) {
        setHost(updated.host ?? "");
        setPort(updated.port === undefined ? "" : String(updated.port));
        setSecure(updated.secure);
        setUser(updated.user ?? "");
        setFrom(updated.from ?? "");
        setPassword("");
        onUpdated(updated);
    }

    async function handleSave() {
        setError(null);
        setSaved(false);
        setSaving(true);
        // Only what changed, and a blank password field means "keep it" — so it's left out, not sent as null.
        const input: SmtpSettingsInput = {};
        if (hostChanged) input.host = host.trim() || null;
        if (portChanged) input.port = port.trim() ? Number(port) : null;
        if (secureChanged) input.secure = secure;
        if (userChanged) input.user = user.trim() || null;
        if (fromChanged) input.from = from.trim() || null;
        if (password) input.password = password;
        try {
            applyServerSettings(await updateSmtpSettings(input));
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove() {
        if (!window.confirm("Remove the saved SMTP user name and password? The server will be used without signing in.")) {
            return;
        }
        setError(null);
        setSaved(false);
        setRemoving(true);
        try {
            applyServerSettings(await updateSmtpSettings({ user: null, password: null }));
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not remove these credentials.");
        } finally {
            setRemoving(false);
        }
    }

    async function handleReset() {
        if (
            !window.confirm(
                "Replace the saved SMTP settings with the ones in this deployment's configuration? Anything you've changed here " +
                    "is lost, and any the configuration doesn't have is cleared.",
            )
        ) {
            return;
        }
        setError(null);
        setSaved(false);
        setResetting(true);
        try {
            applyServerSettings(await resetSmtpSettings());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset these settings.");
        } finally {
            setResetting(false);
        }
    }

    const busy = saving || removing || resetting;

    return (
        <div className="rr-card">
            <div className="rr-card__title">E-mail (SMTP)</div>
            <p className="rr-card__subtitle">
                {settings.configured
                    ? `E-mail is sent through ${settings.host}.`
                    : "E-mail can't be sent yet: a host and a sender address are both needed."}
            </p>
            {error && <Alert>{error}</Alert>}

            <FormField label="Host" htmlFor="smtpHost">
                <input
                    id="smtpHost"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="smtp.example.com"
                    value={host}
                    onChange={(e) => edited(setHost, e.target.value)}
                />
            </FormField>

            <FormField label="Port" htmlFor="smtpPort">
                <input
                    id="smtpPort"
                    className="rr-input"
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="587"
                    value={port}
                    onChange={(e) => edited(setPort, e.target.value)}
                />
            </FormField>

            <div className="rr-field">
                <label htmlFor="smtpSecure" className="rr-switch">
                    <input
                        id="smtpSecure"
                        type="checkbox"
                        role="switch"
                        className="rr-switch__input"
                        checked={secure}
                        onChange={(e) => edited(setSecure, e.target.checked)}
                    />
                    <span className="rr-switch__track" aria-hidden="true" />
                    Encrypt the connection from the start
                </label>
                <p className="rr-hint">
                    On for port 465. Leave it off for port 587 or 25, where the connection is upgraded to encrypted after it
                    starts.
                </p>
            </div>

            <FormField label="User name" htmlFor="smtpUser">
                <input
                    id="smtpUser"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={user}
                    onChange={(e) => edited(setUser, e.target.value)}
                />
            </FormField>

            <FormField label="Password" htmlFor="smtpPassword">
                <input
                    id="smtpPassword"
                    className="rr-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={settings.passwordSet ? "Saved — leave blank to keep it" : ""}
                    value={password}
                    onChange={(e) => edited(setPassword, e.target.value)}
                />
                <p className="rr-hint">Stored encrypted, and can&rsquo;t be viewed again once saved.</p>
            </FormField>

            <FormField label="Send from" htmlFor="smtpFrom">
                <input
                    id="smtpFrom"
                    className="rr-input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Example <no-reply@example.com>"
                    value={from}
                    onChange={(e) => edited(setFrom, e.target.value)}
                />
                <p className="rr-hint">An e-mail address, optionally with a name.</p>
            </FormField>

            <p className="rr-hint">
                These were set from this deployment&rsquo;s configuration the first time the server started. What you save here
                takes over from then on; &ldquo;Reset to configuration&rdquo; replaces it with what the configuration says now.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <Button type="button" onClick={handleSave} loading={saving} disabled={busy || !anythingChanged} style={{ width: "auto" }}>
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
