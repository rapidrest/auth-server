import React, { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

/**
 * A small, dependency-free modal dialog rendered via a portal to `document.body`. Controlled by the
 * caller (`open` state lives in the parent, not here) so multiple call sites can share the same simple
 * contract without each needing its own open/close plumbing.
 */
export default function Modal({ open, onClose, title, children }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<Element | null>(null);
    // Callers routinely pass `onClose` as a fresh inline function every render — reading it through a ref
    // (rather than depending on it directly) keeps the effect below from re-running, and re-stealing focus
    // into the dialog, on every parent re-render (e.g. every keystroke in a field inside the modal).
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        // Remember what had focus before the modal opened so it can be restored on close (e.g. the "+
        // Add" button that triggered this modal), then move focus into the dialog itself.
        triggerRef.current = document.activeElement;
        dialogRef.current?.focus();

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onCloseRef.current();
            }
        }
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            if (triggerRef.current instanceof HTMLElement) {
                triggerRef.current.focus();
            }
        };
    }, [open]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div className="rr-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                className="rr-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                ref={dialogRef}
            >
                <div className="rr-modal__header">
                    <div className="rr-modal__title">{title}</div>
                    <button type="button" className="rr-modal__close" aria-label="Close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="rr-modal__body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
