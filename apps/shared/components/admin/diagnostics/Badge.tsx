///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode } from "react";
import type { IconType } from "react-icons";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface BadgeProps {
    tone?: BadgeTone;
    icon?: IconType;
    children: ReactNode;
}

/**
 * A small pill: an optional icon, then a word or two. The tone tints the pill and colours its icon; the words stay in the
 * normal text colour, and every tone that means something (good, warning, bad) is also worded, so a badge never relies on
 * its colour alone.
 */
export default function Badge({ tone = "neutral", icon: Icon, children }: BadgeProps) {
    return (
        <span className={`rr-diag-badge rr-diag-badge--${tone}`}>
            {Icon && <Icon size={14} aria-hidden="true" />}
            {children}
        </span>
    );
}
