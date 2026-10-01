///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { KeyboardEvent, useEffect, useRef, useState } from "react";
import { HiOutlineArrowDownTray, HiOutlineArrowPath } from "react-icons/hi2";
import Button from "../../buttons/Button.js";
import {
    DiagnosticsMetrics,
    getDiagnosticsInformation,
    getDiagnosticsMetrics,
    getDiagnosticsRuntime,
    getDiagnosticsVersions,
} from "./diagnosticsApi.js";
import { saveTextFile, SaveFile, timestampedFilename } from "./download.js";
import { describeError } from "./format.js";
import InformationPanel from "./InformationPanel.js";
import type { LogSocketFactory } from "./logClient.js";
import LogsPanel from "./LogsPanel.js";
import RuntimePanel from "./RuntimePanel.js";
import SystemPanel from "./SystemPanel.js";
import { useDiagnosticsResource } from "./useDiagnosticsResource.js";
import { useLogStream } from "./useLogStream.js";
import { useMetricsPolling } from "./useMetricsPolling.js";

export type DiagnosticsTab = "information" | "runtime" | "system" | "logs";

const TABS: { id: DiagnosticsTab; label: string }[] = [
    { id: "information", label: "Information" },
    { id: "runtime", label: "Runtime" },
    { id: "system", label: "System" },
    { id: "logs", label: "Logs" },
];

const tabId = (tab: DiagnosticsTab) => `diagnostics-tab-${tab}`;
const panelId = (tab: DiagnosticsTab) => `diagnostics-panel-${tab}`;

export interface DiagnosticsManagerProps {
    /** Creates the log stream's WebSocket. Defaults to the browser's. For a test. */
    createLogSocket?: LogSocketFactory;
    /** Saves a downloaded file. Defaults to `saveTextFile()`. For a test. */
    saveFile?: SaveFile;
}

/**
 * The Diagnostics page: what is installed and how it is set up (Information), what it runs on (Runtime), how it is doing right now (System, live) and what
 * the server is logging (Logs, live, with captures). Information and Runtime are read when the page opens and again on Refresh, and
 * are not polled. The live tabs only work while they are open: System polls only on its tab, and the log stream is opened the
 * first time the Logs tab is (and closes with the page, or on Stop).
 */
export default function DiagnosticsManager({ createLogSocket, saveFile = saveTextFile }: DiagnosticsManagerProps) {
    const [tab, setTab] = useState<DiagnosticsTab>("information");
    const [reloadKey, setReloadKey] = useState(0);
    const [preparingReport, setPreparingReport] = useState(false);
    const versions = useDiagnosticsResource(getDiagnosticsVersions, reloadKey, "Could not read the server's versions.");
    const information = useDiagnosticsResource(getDiagnosticsInformation, reloadKey, "Could not read the server's environment and configuration.");
    const runtime = useDiagnosticsResource(getDiagnosticsRuntime, reloadKey, "Could not read the runtime.");
    const polling = useMetricsPolling(tab === "system");
    const logStream = useLogStream({ createSocket: createLogSocket });
    const logsOpened = useRef(false);
    const { start: startLogs } = logStream;

    useEffect(() => {
        if (tab === "logs" && !logsOpened.current) {
            logsOpened.current = true;
            startLogs();
        }
    }, [tab]);

    const refreshing = versions.loading || information.loading || runtime.loading;

    function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const index = TABS.findIndex((item) => item.id === tab);
        let next: number;
        if (event.key === "ArrowRight") {
            next = (index + 1) % TABS.length;
        } else if (event.key === "ArrowLeft") {
            next = (index + TABS.length - 1) % TABS.length;
        } else if (event.key === "Home") {
            next = 0;
        } else if (event.key === "End") {
            next = TABS.length - 1;
        } else {
            return;
        }
        event.preventDefault();
        setTab(TABS[next].id);
        document.getElementById(tabId(TABS[next].id))?.focus();
    }

    /**
     * Saves the versions, the environment and configuration (the server has already withheld every secret), the runtime and the
     * latest metrics sample (asking for one if the System tab has not sampled): no logs.
     */
    async function downloadReport() {
        setPreparingReport(true);
        const generatedAt = new Date();
        let metrics: DiagnosticsMetrics | undefined = polling.history[polling.history.length - 1];
        let metricsError: string | undefined;
        if (!metrics) {
            try {
                metrics = await getDiagnosticsMetrics();
            } catch (err) {
                metricsError = describeError(err, "Could not read the server's metrics.");
            }
        }
        const report = {
            generatedAt: generatedAt.toISOString(),
            versions: versions.data ?? null,
            information: information.data ?? null,
            runtime: runtime.data ?? null,
            metrics: metrics ?? null,
            errors: {
                versions: versions.error ?? null,
                information: information.error ?? null,
                runtime: runtime.error ?? null,
                metrics: metricsError ?? null,
            },
        };
        saveFile(timestampedFilename("auth-server-diagnostics", "json", generatedAt), `${JSON.stringify(report, null, 2)}\n`, "application/json");
        setPreparingReport(false);
    }

    return (
        <>
            <div className="rr-diag-header">
                <h2 className="rr-diag-title">Diagnostics</h2>
                <div className="rr-diag-toolbar">
                    <Button type="button" variant="secondary" disabled={refreshing} onClick={() => setReloadKey(reloadKey + 1)}>
                        <HiOutlineArrowPath size={16} aria-hidden="true" />
                        Refresh
                    </Button>
                    <Button type="button" loading={preparingReport} onClick={() => void downloadReport()}>
                        <HiOutlineArrowDownTray size={16} aria-hidden="true" />
                        Download diagnostics report
                    </Button>
                </div>
            </div>

            <div role="tablist" aria-label="Diagnostics sections" className="rr-diag-tabs">
                {TABS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        id={tabId(item.id)}
                        aria-selected={item.id === tab}
                        aria-controls={panelId(item.id)}
                        tabIndex={item.id === tab ? 0 : -1}
                        onClick={() => setTab(item.id)}
                        onKeyDown={handleTabKeyDown}
                        className={item.id === tab ? "rr-diag-tab rr-diag-tab--active" : "rr-diag-tab"}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
                {tab === "information" && <InformationPanel versions={versions} information={information} />}
                {tab === "runtime" && <RuntimePanel runtime={runtime} />}
                {tab === "system" && <SystemPanel polling={polling} />}
                {tab === "logs" && <LogsPanel stream={logStream} saveFile={saveFile} />}
            </div>
        </>
    );
}
