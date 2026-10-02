///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import Alert from "../../feedback/Alert.js";
import type { DiagnosticsInformation, DiagnosticsVersions } from "./diagnosticsApi.js";
import type { DiagnosticsResource } from "./useDiagnosticsResource.js";
import ComponentsTable from "./ComponentsTable.js";
import PackagesTable from "./PackagesTable.js";
import ServerVersionCard from "./ServerVersionCard.js";
import SettingsTable from "./SettingsTable.js";

export interface InformationPanelProps {
    versions: DiagnosticsResource<DiagnosticsVersions>;
    information: DiagnosticsResource<DiagnosticsInformation>;
}

/**
 * The Information tab: the server, the deployment's other containers, the server's environment variables and configuration
 * (secrets withheld by the server), and every installed package. The environment and configuration come from their own
 * request, so a server that predates them leaves the rest of the tab working and says so in their place.
 */
export default function InformationPanel({ versions, information }: InformationPanelProps) {
    const { data, error, loading } = versions;
    return (
        <div className="rr-diag-stack">
            {error && <Alert>{error}</Alert>}
            {!data && loading && <p className="rr-diag-muted">Loading&hellip;</p>}
            {data && (
                <>
                    <ServerVersionCard server={data.server} />
                    <ComponentsTable components={data.components ?? []} kubernetes={data.kubernetes ?? { available: false }} />
                    {information.error && <Alert>{information.error}</Alert>}
                    {!information.data && information.loading && <p className="rr-diag-muted">Loading the environment&hellip;</p>}
                    {information.data && (
                        <>
                            <SettingsTable
                                id="diagnostics-environment"
                                title="Environment variables"
                                description="The server process's environment. Every variable shows its value except those on the server's list of hidden settings, whose value is withheld by the server and never sent."
                                settings={information.data.environment ?? []}
                            />
                            <SettingsTable
                                id="diagnostics-configuration"
                                title="Configuration"
                                description="The effective settings the server runs with: the environment, runtime settings and defaults combined. Settings on the server's list of hidden settings, such as passwords, tokens and keys, are withheld by the server and never sent, and so are the credentials in URLs."
                                settings={information.data.configuration ?? []}
                            />
                        </>
                    )}
                    <PackagesTable packages={data.packages ?? []} />
                </>
            )}
        </div>
    );
}
