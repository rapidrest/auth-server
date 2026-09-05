// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RevealSecretModal from "../../../../apps/shared/components/admin/oauth-clients/RevealSecretModal.js";

describe("RevealSecretModal", () => {
    it("renders nothing when there is no secret to reveal", () => {
        render(<RevealSecretModal open={true} onClose={vi.fn()} clientSecret={null} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("displays the plaintext secret as selectable text", () => {
        render(<RevealSecretModal open={true} onClose={vi.fn()} clientSecret="plaintext-secret-value" />);
        expect(screen.getByText("plaintext-secret-value")).toBeInTheDocument();
    });

    it("calls onClose when Done is clicked", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<RevealSecretModal open={true} onClose={onClose} clientSecret="plaintext-secret-value" />);
        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(onClose).toHaveBeenCalled();
    });
});
