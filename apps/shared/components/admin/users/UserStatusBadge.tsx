import React from "react";

export default function UserStatusBadge({ verified }: { verified?: boolean }) {
    return <span className={"rr-badge" + (verified ? " rr-badge--success" : "")}>{verified ? "Verified" : "Unverified"}</span>;
}
