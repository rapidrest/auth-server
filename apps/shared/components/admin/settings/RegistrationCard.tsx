///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { SystemSettings, updateSystemSettings } from "../../../lib/systemSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface RegistrationCardProps {
    settings: SystemSettings;
    onUpdated: (settings: SystemSettings) => void;
}

/**
 * Registration and MFA policy, both stored in the runtime-togglable `SystemSettings` (see
 * `@rapidrest/auth`'s `BaseSettingsRoute`) — changes here take effect immediately, no restart needed.
 * `settings.requireMFA` is only present at all when this caller has the admin trusted role (see
 * `BaseSettingsRoute.get()`'s scope gating); the toggle is simply omitted otherwise, since this card is
 * only ever rendered inside the admin console, where that's always true.
 *
 * Unlike the branding settings' fields, neither toggle here supports a "revert to server default" action:
 * `SystemSettings` never accepts `null` (see its own doc comment) — once a value is saved, it's
 * authoritative until an admin changes it again.
 */
export default function RegistrationCard({ settings, onUpdated }: RegistrationCardProps) {
    const [allowRegistration, setAllowRegistration] = useState(settings.allowRegistration !== false);
    const [requireMFA, setRequireMFA] = useState(settings.requireMFA === true);
    const [allowMultiplePasswords, setAllowMultiplePasswords] = useState(settings.allowMultiplePasswords === true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const updated = await updateSystemSettings({
                allowRegistration,
                requireMFA,
                ...(settings.allowMultiplePasswords !== undefined ? { allowMultiplePasswords } : {}),
            });
            onUpdated(updated);
            setAllowRegistration(updated.allowRegistration !== false);
            setRequireMFA(updated.requireMFA === true);
            setAllowMultiplePasswords(updated.allowMultiplePasswords === true);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not save these settings.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Registration &amp; Security</div>
            <p className="rr-card__subtitle">Control whether new accounts can be created, whether MFA is required, and how many passwords an account can have.</p>
            {error && <Alert>{error}</Alert>}

            <div className="rr-field">
                <label htmlFor="settingsAllowRegistration" className="rr-switch">
                    <input
                        id="settingsAllowRegistration"
                        type="checkbox"
                        role="switch"
                        className="rr-switch__input"
                        checked={allowRegistration}
                        onChange={(e) => {
                            setAllowRegistration(e.target.checked);
                            setSaved(false);
                        }}
                    />
                    <span className="rr-switch__track" aria-hidden="true" />
                    Allow new user registration
                </label>
                <p className="rr-hint">
                    When disabled, nobody can create an account via sign-up, the public user-creation API, or a
                    first-time sign-in with Google, Apple, Facebook, or Microsoft. Administrators can still create
                    users from this console.
                </p>
            </div>

            {settings.requireMFA !== undefined && (
                <div className="rr-field">
                    <label htmlFor="settingsRequireMFA" className="rr-switch">
                        <input
                            id="settingsRequireMFA"
                            type="checkbox"
                            role="switch"
                            className="rr-switch__input"
                            checked={requireMFA}
                            onChange={(e) => {
                                setRequireMFA(e.target.checked);
                                setSaved(false);
                            }}
                        />
                        <span className="rr-switch__track" aria-hidden="true" />
                        Require multi-factor authentication
                    </label>
                    <p className="rr-hint">
                        When enabled, every account must have a second factor to sign in, and new accounts are
                        created with it required from the start. Administrators can still exempt an individual
                        existing account from this console.
                    </p>
                </div>
            )}

            {settings.allowMultiplePasswords !== undefined && (
                <div className="rr-field">
                    <label htmlFor="settingsAllowMultiplePasswords" className="rr-switch">
                        <input
                            id="settingsAllowMultiplePasswords"
                            type="checkbox"
                            role="switch"
                            className="rr-switch__input"
                            checked={allowMultiplePasswords}
                            onChange={(e) => {
                                setAllowMultiplePasswords(e.target.checked);
                                setSaved(false);
                            }}
                        />
                        <span className="rr-switch__track" aria-hidden="true" />
                        Allow accounts to have multiple passwords
                    </label>
                    <p className="rr-hint">
                        When disabled (the default), an account has only one password, so whoever can change it decides
                        who can sign in by password. When enabled, an account can have several and any of them signs
                        in — which lets you keep a password of your own on an account, one its holder can&rsquo;t
                        change, alongside theirs. Turning this off doesn&rsquo;t remove passwords accounts already
                        have.
                    </p>
                </div>
            )}

            <Button type="button" onClick={save} loading={saving} disabled={saving} style={{ width: "auto" }}>
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
