// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import CodeInput, { normalizeSentCode } from "../../../apps/shared/components/forms/CodeInput.js";

function Harness({ sent, length }: { sent?: boolean; length?: number }) {
    const [value, setValue] = useState("");
    return <CodeInput id="code" value={value} onChange={setValue} sent={sent} length={length} />;
}

describe("CodeInput", () => {
    it("keeps only digits for an authenticator code, up to its length", async () => {
        render(<Harness />);
        const input = screen.getByRole<HTMLInputElement>("textbox");
        expect(input).toHaveAttribute("inputmode", "numeric");
        await userEvent.type(input, "12a3-45 6789");
        expect(input.value).toBe("123456");
    });

    it("accepts letters for a sent code, upper-cased, without spaces or hyphens", async () => {
        // @rapidrest/auth 3 sends codes like "7KQ4MZ" and normalizes input the same way.
        render(<Harness sent />);
        const input = screen.getByRole<HTMLInputElement>("textbox");
        expect(input).toHaveAttribute("inputmode", "text");
        expect(input).toHaveAttribute("autocapitalize", "characters");
        await userEvent.type(input, "7kq-4 mz");
        expect(input.value).toBe("7KQ4MZ");
    });

    it("doesn't cut a sent code off at the placeholder length, since auth:otp:length is configurable", async () => {
        render(<Harness sent />);
        const input = screen.getByRole<HTMLInputElement>("textbox");
        await userEvent.type(input, "ABCDEFGH");
        expect(input.value).toBe("ABCDEFGH");
    });

    it("normalizeSentCode mirrors the server's normalization", () => {
        expect(normalizeSentCode(" ab-cd\t23 ")).toBe("ABCD23");
    });
});
