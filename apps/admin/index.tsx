import React, { useEffect } from "react";

interface HomePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function HomePage({ userUid }: HomePageProps) {
    return (
        <div className="rr-page">
            <div className="rr-brand">
                <img src="/images/logo.svg" width="36" height="36" alt="" />
                <span>RapidREST: Admin Console</span>
            </div>
        </div>
    );
}
