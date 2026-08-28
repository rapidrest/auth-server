///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { ReactNode } from "react";

export default function Alert({ children }: { children: ReactNode }) {
    return (
        <div className="rr-alert rr-alert--error" role="alert">
            {children}
        </div>
    );
}
