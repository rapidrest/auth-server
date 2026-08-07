import React from "react";
import Button from "../../buttons/Button.js";
import { Profile } from "../../../lib/api.js";

export interface AccountHeaderProps {
    profile: Profile | null;
    onLogout: () => void;
    /** Shows a link to the admin console. Omit/false for non-admin accounts. */
    isAdmin?: boolean;
}

export default function AccountHeader({ profile, onLogout, isAdmin }: AccountHeaderProps) {
    const email = profile?.contacts?.find((c) => c.type === "email")?.contact;
    const displayName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ") || email || "there";
    const initial = (profile?.givenName || email || "?").charAt(0).toUpperCase();

    return (
        <div className="rr-card">
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
                <div className="rr-avatar">{initial}</div>
                <div>
                    <div className="rr-card__title" style={{ marginBottom: 0 }}>
                        Welcome, {displayName}
                    </div>
                    {email && (
                        <div className="rr-card__subtitle" style={{ marginBottom: 0 }}>
                            {email}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
                {isAdmin && (
                    <a href="/admin">
                        <Button variant="secondary" type="button">
                            Admin console
                        </Button>
                    </a>
                )}
                <Button variant="secondary" type="button" onClick={onLogout}>
                    Log out
                </Button>
            </div>
        </div>
    );
}
