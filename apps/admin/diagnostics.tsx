///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { PublicSiteSettings } from "../shared/lib/siteSettings.js";
import AdminShell from "../shared/components/admin/layout/AdminShell.js";
import DiagnosticsManager from "../shared/components/admin/diagnostics/DiagnosticsManager.js";

interface DiagnosticsPageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
    /** Populated automatically by the framework — see `AdminConsoleRoute`'s `fetchProps()` override. */
    siteSettings?: PublicSiteSettings;
}

export default function DiagnosticsPage({ userUid, siteSettings }: DiagnosticsPageProps) {
    return (
        <AdminShell userUid={userUid} settings={siteSettings} section="diagnostics">
            <DiagnosticsManager />
        </AdminShell>
    );
}
