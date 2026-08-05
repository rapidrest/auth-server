import React, { useEffect } from "react";

interface HomePageProps {
    /** Populated automatically by the framework from an authenticated request (e.g. a valid `jwt` cookie). */
    userUid?: string;
}

export default function HomePage({ userUid }: HomePageProps) {
    const target = userUid ? "/account" : "/auth/signin";

    useEffect(() => {
        window.location.replace(target);
    }, [target]);

    return (
        <div className="rr-page">
            <noscript>
                <meta httpEquiv="refresh" content={`0;url=${target}`} />
            </noscript>
            <div className="rr-brand">
                <img src="/images/logo.svg" width="36" height="36" alt="" />
                <span>RapidREST</span>
            </div>
        </div>
    );
}
