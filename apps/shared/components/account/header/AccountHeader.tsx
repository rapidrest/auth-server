import React from "react";
import Button from "../../buttons/Button.js";
import { Profile } from "../../../lib/api.js";

export interface AccountHeaderProps {
    profile: Profile | null;
    onLogout: () => void;
}

export default function AccountHeader({ profile, onLogout }: AccountHeaderProps) {
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
            <Button variant="secondary" type="button" onClick={onLogout}>
                Log out
            </Button>
        </div>
    );
}
