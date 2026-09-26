///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode } from "react";
import Sparkline, { SparklineProps } from "./Sparkline.js";
import UsageMeter from "./UsageMeter.js";

export interface MetricTileProps {
    /** What is measured (`CPU`). */
    label: string;
    /** The current value, written out (`1.2 cores`). */
    value: string;
    /** Smaller text under the value. */
    detail?: string;
    /** When the value is a share of a capacity: the share (0 to 100) and the amounts it comes from. */
    usage?: { percent: number; detail: string; flag?: boolean };
    /** The value's recent history, drawn under it. */
    history?: Omit<SparklineProps, "label">;
    children?: ReactNode;
}

/** One measurement: its label, the current value in numbers, a meter when it has a capacity, and a sparkline of its recent past. */
export default function MetricTile({ label, value, detail, usage, history, children }: MetricTileProps) {
    return (
        <div className="rr-diag-tile">
            <div className="rr-diag-tile__label">{label}</div>
            <div className="rr-diag-tile__value">{value}</div>
            {detail && <div className="rr-diag-status">{detail}</div>}
            {usage && (
                <div className="rr-diag-tile__part">
                    <UsageMeter label={`${label} usage`} percent={usage.percent} detail={usage.detail} flag={usage.flag} />
                </div>
            )}
            {history && (
                <div className="rr-diag-tile__part">
                    <Sparkline label={label} {...history} />
                </div>
            )}
            {children}
        </div>
    );
}
