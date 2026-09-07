///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { PropsWithChildren } from "react";
import ElevationHost from "../elevation/ElevationHost.js";
import ImpersonationBanner from "../impersonation/ImpersonationBanner.js";

export interface AuthShellProps {
    /** Shows the RapidREST logo + wordmark above the content. Omit on pages that don't want it (e.g. account). */
    brand?: boolean;
    /** Widens the container for pages with more content (e.g. account, which has multiple cards/tables). */
    wide?: boolean;
}

/**
 * The `.rr-page > .rr-container` chrome shared by every auth page.
 */
export default function AuthShell({ brand, wide, children }: PropsWithChildren<AuthShellProps>) {
    return (
        <div className="rr-page">
            <div className={"rr-container" + (wide ? " rr-container--wide" : "")}>
                <ImpersonationBanner />
                {brand && (
                    <div className="rr-brand">
                        <img src="/images/logo.svg" width="128" height="128" alt="" />
                        <br />
                        <span>RapidREST</span>
                    </div>
                )}
                {children}
            </div>
            <ElevationHost />
        </div>
    );
}
