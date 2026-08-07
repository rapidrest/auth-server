// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import UserStatusBadge from "../../../../apps/shared/components/admin/users/UserStatusBadge.js";

describe("UserStatusBadge", () => {
    it("renders 'Verified' with the success class when verified", () => {
        render(<UserStatusBadge verified={true} />);
        expect(screen.getByText("Verified")).toHaveClass("rr-badge", "rr-badge--success");
    });

    it("renders 'Unverified' without the success class when not verified", () => {
        render(<UserStatusBadge verified={false} />);
        expect(screen.getByText("Unverified")).toHaveClass("rr-badge");
        expect(screen.getByText("Unverified")).not.toHaveClass("rr-badge--success");
    });

    it("treats an undefined verified as unverified", () => {
        render(<UserStatusBadge />);
        expect(screen.getByText("Unverified")).toBeInTheDocument();
    });
});
