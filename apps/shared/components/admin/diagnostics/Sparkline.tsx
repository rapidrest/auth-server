///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";

const WIDTH = 120;
const HEIGHT = 28;

export interface SparklineProps {
    /** What the history shows, for assistive technology (e.g. "CPU history"). */
    label: string;
    /** Oldest first. */
    values: number[];
    /** The value the top of the chart stands for; defaults to the largest value in `values`. */
    max?: number;
}

/** A tiny line chart of recent samples, oldest on the left. Draws nothing until there are two samples. */
export default function Sparkline({ label, values, max }: SparklineProps) {
    const top = max ?? Math.max(...values, 0);
    const points =
        values.length < 2
            ? ""
            : values
                  .map((value, i) => {
                      const x = (i / (values.length - 1)) * WIDTH;
                      const y = HEIGHT - (top > 0 ? Math.min(1, value / top) : 0) * (HEIGHT - 2) - 1;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ");
    return (
        <svg
            className="rr-sparkline"
            role="img"
            aria-label={label}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
        >
            {points && <polyline points={points} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        </svg>
    );
}
