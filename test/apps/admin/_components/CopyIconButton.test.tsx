// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CopyIconButton from "../../../../apps/shared/components/buttons/CopyIconButton.js";

describe("CopyIconButton", () => {
    it("copies its value, says Copied, and resets when the value changes", async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const { rerender } = render(<CopyIconButton value="abc" />);

        await user.click(screen.getByRole("button", { name: "Copy" }));
        expect(writeText).toHaveBeenCalledWith("abc");
        expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

        rerender(<CopyIconButton value="def" />);
        expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    });

    it("stays on Copy when the clipboard is unavailable", async () => {
        const user = userEvent.setup();
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        });
        render(<CopyIconButton value="abc" />);

        await user.click(screen.getByRole("button", { name: "Copy" }));
        expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    });
});
