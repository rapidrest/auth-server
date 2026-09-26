// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Meter from "../../../../apps/shared/components/admin/diagnostics/Meter.js";
import Sparkline from "../../../../apps/shared/components/admin/diagnostics/Sparkline.js";

describe("Meter", () => {
    it.each([
        [0.5, "ok"],
        [0.75, "warn"],
        [0.89, "warn"],
        [0.9, "danger"],
        [1, "danger"],
    ])("fills to %d and turns the %s colour", (value, level) => {
        const { container } = render(<Meter label="Memory" value={value} />);
        const meter = screen.getByRole("meter", { name: "Memory" });
        expect(meter).toHaveAttribute("aria-valuenow", String(Math.round(value * 100)));
        const bar = container.querySelector(".rr-meter__bar")!;
        expect(bar).toHaveClass(`rr-meter__bar--${level}`);
        expect((bar as HTMLElement).style.width).toBe(`${value * 100}%`);
    });
});

describe("Sparkline", () => {
    function points(container: HTMLElement) {
        return container.querySelector("polyline")?.getAttribute("points");
    }

    it("draws nothing until there are two samples", () => {
        expect(points(render(<Sparkline label="CPU history" values={[]} />).container)).toBeUndefined();
        expect(points(render(<Sparkline label="CPU history" values={[5]} />).container)).toBeUndefined();
        expect(screen.getAllByRole("img", { name: "CPU history" })).toHaveLength(2);
    });

    it("scales to the largest sample by default, oldest on the left", () => {
        const { container } = render(<Sparkline label="h" values={[0, 5, 10]} />);
        // x runs 0..120; y runs from the bottom (27) for 0 to the top (1) for the largest value.
        expect(points(container)).toBe("0.0,27.0 60.0,14.0 120.0,1.0");
    });

    it("scales to a given maximum and caps anything above it", () => {
        const { container } = render(<Sparkline label="h" values={[1, 5]} max={2} />);
        expect(points(container)).toBe("0.0,14.0 120.0,1.0");
    });

    it("draws a flat line along the bottom when everything is zero", () => {
        const { container } = render(<Sparkline label="h" values={[0, 0]} />);
        expect(points(container)).toBe("0.0,27.0 120.0,27.0");
    });
});
