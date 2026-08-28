///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";

export default function UserStatusBadge({ verified }: { verified?: boolean }) {
    return <span className={"rr-badge" + (verified ? " rr-badge--success" : "")}>{verified ? "Verified" : "Unverified"}</span>;
}
