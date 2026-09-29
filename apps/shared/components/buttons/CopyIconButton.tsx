///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { useEffect, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";

export interface CopyIconButtonProps {
    /** The text placed on the clipboard. Changing it resets the "Copied" state. */
    value: string;
}

/** The standard borderless copy-to-clipboard icon button; swaps to a check mark once copied. */
export default function CopyIconButton({ value }: CopyIconButtonProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setCopied(false);
    }, [value]);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
        } catch {
            // Clipboard unavailable or denied — the value is still on screen, so it can be copied by hand.
        }
    }

    const label = copied ? "Copied" : "Copy";
    return (
        <button type="button" className="rr-icon-button" onClick={handleCopy} aria-label={label} title={label}>
            {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
        </button>
    );
}
