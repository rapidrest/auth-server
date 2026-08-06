import React, { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "text" | "oauth";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
    variant?: ButtonVariant;
    /** Renders the rr-spinner span before the button's content. */
    loading?: boolean;
}

/**
 * A `.rr-button` with the shared variant styling. Note `variant="text"` intentionally renders only
 * `rr-button--text` (not `rr-button rr-button--text`) — that class carries its own width/padding
 * reset in globals.css and was never combined with the base `.rr-button` class in the original markup.
 */
export default function Button({ variant = "primary", loading, children, ...rest }: ButtonProps) {
    const variantClass = variant === "text" ? "rr-button--text" : `rr-button rr-button--${variant}`;
    return (
        <button className={variantClass} {...rest}>
            {loading && <span className="rr-spinner" />}
            {children}
        </button>
    );
}
