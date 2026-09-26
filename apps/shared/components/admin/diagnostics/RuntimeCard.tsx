///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { ApiRequestError } from "../../../lib/api.js";
import { getRuntime, RuntimeResponse } from "../../../lib/diagnosticsApi.js";
import Alert from "../../feedback/Alert.js";

/** The Kubernetes (or k3s) version the server is running on, and where in the cluster it is. */
export default function RuntimeCard() {
    const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getRuntime()
            .then(setRuntime)
            .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Could not load runtime information."));
    }, []);

    if (error) {
        return <Alert>{error}</Alert>;
    }
    if (!runtime) {
        return <p className="rr-hint">Loading&hellip;</p>;
    }
    if (!runtime.inCluster) {
        return <p className="rr-hint">Not running in Kubernetes.</p>;
    }
    if (!runtime.version) {
        return <Alert>Could not read the cluster&apos;s version: {runtime.error}</Alert>;
    }

    const { version } = runtime;
    return (
        <dl className="rr-diag-facts">
            <dt>Kubernetes</dt>
            <dd>
                {version.gitVersion}
                {version.distribution && (
                    <>
                        {" "}
                        <span className="rr-badge">{version.distribution}</span>
                    </>
                )}
            </dd>
            <dt>Platform</dt>
            <dd>{version.platform ?? "—"}</dd>
            <dt>Namespace</dt>
            <dd>{runtime.namespace}</dd>
            <dt>This pod</dt>
            <dd>{runtime.podName ?? "—"}</dd>
        </dl>
    );
}
