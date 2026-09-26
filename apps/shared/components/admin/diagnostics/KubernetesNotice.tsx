///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { HiOutlineInformationCircle } from "react-icons/hi2";

/**
 * Said where Kubernetes information would be, when the server cannot reach a cluster. That is ordinary (for one, when the
 * server runs under Docker Compose), so it is a plain note and not an error.
 */
export default function KubernetesNotice({ reason }: { reason?: string }) {
    return (
        <div role="status" className="rr-diag-notice">
            <HiOutlineInformationCircle size={20} aria-hidden="true" />
            <div>
                <p className="rr-diag-notice__title">Kubernetes information is not available on this server.</p>
                {reason && <p className="rr-diag-muted">{reason}</p>}
                <p className="rr-diag-muted">
                    This is expected when the server does not run in a Kubernetes cluster, for example under Docker Compose.
                </p>
            </div>
        </div>
    );
}
