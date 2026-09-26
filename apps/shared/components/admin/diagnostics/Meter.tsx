///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";

/** Past this, the bar turns to the warning colour, and past `DANGER_AT` to the error one. */
const WARN_AT = 0.75;
const DANGER_AT = 0.9;

export interface MeterProps {
    /** What is being measured, for assistive technology (e.g. "Memory"). */
    label: string;
    /** How full it is, from 0 to 1. */
    value: number;
}

/** A horizontal fill bar for a usage figure. */
export default function Meter({ label, value }: MeterProps) {
    const level = value >= DANGER_AT ? "danger" : value >= WARN_AT ? "warn" : "ok";
    return (
        <div
            className="rr-meter"
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value * 100)}
        >
            <div className={`rr-meter__bar rr-meter__bar--${level}`} style={{ width: `${value * 100}%` }} />
        </div>
    );
}
