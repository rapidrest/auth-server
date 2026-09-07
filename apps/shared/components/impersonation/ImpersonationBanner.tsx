///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { ApiRequestError, clearImpersonatingMarker, isImpersonating, stopImpersonating } from "../../lib/api.js";
import Button from "../buttons/Button.js";

/** Height of the fixed bar — also used by its spacer below, so the two always stay in sync. */
const BAR_HEIGHT = "2.25rem";

/**
 * Thin bar pinned to the top of the viewport (`position: fixed`) for as long as this browser is marked as
 * viewing an impersonated session — stays visible no matter how far the page is scrolled, and above every
 * other page element (including modals — see the `z-index`). Rendered at the top of `AdminShell`/
 * `AuthShell`, ahead of everything else those shells render, so it visually frames the whole page.
 *
 * A sibling spacer of the same fixed `BAR_HEIGHT` is rendered right alongside it, in normal document flow,
 * so the fixed bar doesn't cover the content that follows — that content simply starts `BAR_HEIGHT` lower.
 *
 * Seeded from a lazy `useState` initializer (mirrors `readTargetUid()`/`readReturnTo()`'s own SSR-safe
 * pattern elsewhere in this app) so it renders correctly on the very first client render pass instead of
 * popping in after a post-hydration effect. See `isImpersonating()`'s doc comment for why this is a
 * client-side hint rather than server-derived.
 */
export default function ImpersonationBanner() {
    const [impersonating] = useState(isImpersonating);
    const [stopping, setStopping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!impersonating) {
        return null;
    }

    async function handleStop() {
        setStopping(true);
        setError(null);
        try {
            await stopImpersonating();
            clearImpersonatingMarker();
            window.location.href = "/admin";
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Could not stop impersonating.");
            setStopping(false);
        }
    }

    return (
        <>
            <div style={{ height: BAR_HEIGHT, flexShrink: 0 }} aria-hidden="true" />
            <div
                className="rr-alert rr-alert--warning"
                role="alert"
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: BAR_HEIGHT,
                    zIndex: 1100,
                    margin: 0,
                    borderRadius: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                    padding: "0 1rem",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
                }}
            >
                <span
                    style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "0.85rem",
                    }}
                >
                    {error ?? "You're impersonating another account."}
                </span>
                <Button
                    variant="secondary"
                    type="button"
                    style={{ width: "auto", flexShrink: 0, padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}
                    loading={stopping}
                    disabled={stopping}
                    onClick={handleStop}
                >
                    Stop impersonating
                </Button>
            </div>
        </>
    );
}
