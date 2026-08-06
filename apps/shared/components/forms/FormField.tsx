import React, { ReactNode } from "react";

export interface FormFieldProps {
    label: string;
    htmlFor: string;
    children: ReactNode;
}

/** The repeated `.rr-field` label+input wrapper. The input (and any hint/error text) is passed as children. */
export default function FormField({ label, htmlFor, children }: FormFieldProps) {
    return (
        <div className="rr-field">
            <label htmlFor={htmlFor}>{label}</label>
            {children}
        </div>
    );
}
