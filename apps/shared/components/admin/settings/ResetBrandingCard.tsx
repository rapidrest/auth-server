///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { resetSiteSettings } from "../../../lib/adminApi.js";
import { PublicSiteSettings } from "../../../lib/siteSettings.js";
import Alert from "../../feedback/Alert.js";
import Button from "../../buttons/Button.js";

export interface ResetBrandingCardProps {
    onUpdated: (settings: PublicSiteSettings) => void;
}

/**
 * Puts every branding field above — site title, company name, header/footer HTML, and the logo/icon/stylesheet
 * (their reference URLs, and any directly uploaded image or CSS) — back to what this deployment's `site_settings`
 * config says right now, the same values that would have seeded the row on first start. A downstream app that
 * deploys this server with its own `site_settings` config uses this to pick up a config change after the row has
 * already been seeded (config otherwise only seeds a field once — see `BaseSiteSettingsRoute`).
 */
export default function ResetBrandingCard({ onUpdated }: ResetBrandingCardProps) {
    const [resetting, setResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleReset() {
        if (
            !window.confirm(
                "Replace every branding field above with what this deployment's configuration says right now? Anything " +
                    "you've changed here — including an uploaded logo, icon or stylesheet — is lost, and any field the " +
                    "configuration doesn't set is cleared.",
            )
        ) {
            return;
        }
        setError(null);
        setResetting(true);
        try {
            onUpdated(await resetSiteSettings());
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not reset the branding.");
        } finally {
            setResetting(false);
        }
    }

    return (
        <div className="rr-card">
            <div className="rr-card__title">Reset branding</div>
            <p className="rr-card__subtitle">
                Discard every change made here and go back to what this deployment&rsquo;s configuration says.
            </p>
            {error && <Alert>{error}</Alert>}
            <Button
                type="button"
                variant="secondary"
                onClick={handleReset}
                loading={resetting}
                disabled={resetting}
                style={{ width: "auto" }}
            >
                Reset to configuration
            </Button>
        </div>
    );
}
