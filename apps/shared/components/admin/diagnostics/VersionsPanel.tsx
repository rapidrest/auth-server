///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import Alert from "../../feedback/Alert.js";
import type { DiagnosticsVersions } from "./diagnosticsApi.js";
import type { DiagnosticsResource } from "./useDiagnosticsResource.js";
import ComponentsTable from "./ComponentsTable.js";
import PackagesTable from "./PackagesTable.js";
import ServerVersionCard from "./ServerVersionCard.js";

export interface VersionsPanelProps {
    versions: DiagnosticsResource<DiagnosticsVersions>;
}

/** The Versions tab: the server, its packages and the deployment's other containers. */
export default function VersionsPanel({ versions }: VersionsPanelProps) {
    const { data, error, loading } = versions;
    return (
        <div className="rr-diag-stack">
            {error && <Alert>{error}</Alert>}
            {!data && loading && <p className="rr-diag-muted">Loading&hellip;</p>}
            {data && (
                <>
                    <ServerVersionCard server={data.server} />
                    <ComponentsTable components={data.components ?? []} kubernetes={data.kubernetes ?? { available: false }} />
                    <PackagesTable packages={data.packages ?? []} />
                </>
            )}
        </div>
    );
}
