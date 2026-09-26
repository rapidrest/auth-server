///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { HiOutlineExclamationCircle, HiOutlineExclamationTriangle } from "react-icons/hi2";
import { formatPercent } from "./format.js";

/** Above this share of its capacity, a resource is called high. */
export const HIGH_USAGE_PERCENT = 80;

/** Above this share of its capacity, a resource is called critical. */
export const CRITICAL_USAGE_PERCENT = 90;

export type UsageSeverity = "normal" | "high" | "critical";

export function usageSeverity(percent: number): UsageSeverity {
    if (percent > CRITICAL_USAGE_PERCENT) {
        return "critical";
    }
    return percent > HIGH_USAGE_PERCENT ? "high" : "normal";
}

export interface UsageMeterProps {
    /** What the bar measures (`Data volume usage`), for its text alternative. */
    label: string;
    /** How much of the capacity is used, 0 to 100 (a value outside is clamped for the bar, and written as it is). */
    percent: number;
    /** The amounts the percentage comes from (`3.2 GiB of 8 GiB`). */
    detail: string;
    /**
     * Whether a high value is flagged (default). Off for a figure that is not the fullness of something of its own, such as a
     * volume that shares the node's disk, where "nearly full" would be a false alarm.
     */
    flag?: boolean;
}

/**
 * A bar showing how full something is. The amounts and the percentage are always written beside it, and a bar over
 * `HIGH_USAGE_PERCENT` or `CRITICAL_USAGE_PERCENT` is also worded (High, Critical) with an icon, so the state is never
 * only a colour.
 */
export default function UsageMeter({ label, percent, detail, flag = true }: UsageMeterProps) {
    const severity = flag ? usageSeverity(percent) : "normal";
    const width = Math.min(Math.max(percent, 0), 100);
    return (
        <div>
            <div className="rr-diag-meter-row">
                <span className="rr-diag-num">{detail}</span>
                <span className={`rr-diag-meter-row__value rr-diag-meter-row__value--${severity} rr-diag-num`}>
                    {severity === "high" && <HiOutlineExclamationTriangle size={16} aria-hidden="true" />}
                    {severity === "critical" && <HiOutlineExclamationCircle size={16} aria-hidden="true" />}
                    {formatPercent(percent)}
                    {severity !== "normal" && <span className="rr-diag-strong">{severity === "high" ? "High" : "Critical"}</span>}
                </span>
            </div>
            <div
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(width)}
                aria-valuetext={`${detail}, ${formatPercent(percent)}${severity === "normal" ? "" : `, ${severity}`}`}
                className="rr-diag-meter"
            >
                <div className={`rr-diag-meter__fill rr-diag-meter__fill--${severity}`} style={{ width: `${width}%` }} />
            </div>
        </div>
    );
}
