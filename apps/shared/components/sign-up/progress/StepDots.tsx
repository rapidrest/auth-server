import React from "react";

export interface StepDotsProps {
    count: number;
    activeIndex: number;
}

/** The `.rr-steps` progress dots, generic enough to reuse for any multi-step flow. */
export default function StepDots({ count, activeIndex }: StepDotsProps) {
    return (
        <div className="rr-steps" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    className={
                        "rr-step-dot" + (i === activeIndex ? " rr-step-dot--active" : i < activeIndex ? " rr-step-dot--done" : "")
                    }
                />
            ))}
        </div>
    );
}
