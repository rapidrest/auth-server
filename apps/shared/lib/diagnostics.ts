///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/** Display helpers shared by the Diagnostics page's cards. */

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

/** `1536` → `1.5 KiB`; `undefined` (a figure that wasn't reported) → an em dash. */
export function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) {
        return "—";
    }
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
}

/** CPU cores: `0.25` → `250m` (as Kubernetes writes it), `1.5` → `1.50`. */
export function formatCores(cores: number | undefined): string {
    if (cores === undefined) {
        return "—";
    }
    return cores < 1 ? `${Math.round(cores * 1000)}m` : cores.toFixed(2);
}

/** `12.345` → `12.3%`. */
export function formatPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
}

/** `93784` → `1d 2h`, `3700` → `1h 1m`, `75` → `1m 15s`, `12` → `12s`. */
export function formatDuration(seconds: number): string {
    const s = Math.floor(seconds);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${s % 60}s`;
    return `${s}s`;
}

/** How full something is, from 0 to 1; `undefined` when there's no capacity to measure against. */
export function fraction(used: number | undefined, total: number | undefined): number | undefined {
    if (used === undefined || !total) {
        return undefined;
    }
    return Math.min(1, Math.max(0, used / total));
}

/** Hands `text` to the browser as a file download named `filename`. */
export function downloadText(filename: string, text: string, mimeType = "text/plain"): void {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
