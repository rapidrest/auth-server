import React, { ReactNode } from "react";

export default function Alert({ children }: { children: ReactNode }) {
    return (
        <div className="rr-alert rr-alert--error" role="alert">
            {children}
        </div>
    );
}
