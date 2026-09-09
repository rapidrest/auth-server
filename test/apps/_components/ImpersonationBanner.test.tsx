// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../testUtils.js";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, stopImpersonating: vi.fn() };
});

import { ApiRequestError, isImpersonating, markImpersonating, stopImpersonating } from "../../../apps/shared/lib/api.js";
import ImpersonationBanner from "../../../apps/shared/components/impersonation/ImpersonationBanner.js";

const mockedStopImpersonating = vi.mocked(stopImpersonating);

beforeEach(() => {
    mockedStopImpersonating.mockReset();
});

afterEach(() => {
    localStorage.clear();
});

describe("ImpersonationBanner", () => {
    it("renders nothing when this browser isn't marked as impersonating", () => {
        const { container } = render(<ImpersonationBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the warning and stop button once this browser is marked as impersonating", () => {
        markImpersonating();
        render(<ImpersonationBanner />);
        expect(screen.getByRole("alert")).toHaveTextContent("You're impersonating another account.");
        expect(screen.getByRole("button", { name: "Stop impersonating" })).toBeInTheDocument();
    });

    it("stops impersonating, clears the marker, and redirects to /admin", async () => {
        markImpersonating();
        mockedStopImpersonating.mockResolvedValue({ restored: true });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<ImpersonationBanner />);

        await user.click(screen.getByRole("button", { name: "Stop impersonating" }));

        expect(mockedStopImpersonating).toHaveBeenCalled();
        await waitFor(() => expect(location.href).toBe("/admin"));
        expect(isImpersonating()).toBe(false);
    });

    it("shows an error and does not redirect or clear the marker when stopping fails", async () => {
        markImpersonating();
        mockedStopImpersonating.mockRejectedValue(new ApiRequestError("nope", 500));
        const location = mockLocation();
        const user = userEvent.setup();
        render(<ImpersonationBanner />);

        await user.click(screen.getByRole("button", { name: "Stop impersonating" }));

        // The error replaces the normal message in-place, keeping the bar a single thin line rather than
        // growing to fit a separate error block underneath it.
        expect(await screen.findByText("nope")).toBeInTheDocument();
        expect(screen.queryByText("You're impersonating another account.")).not.toBeInTheDocument();
        expect(location.href).toBe("");
        expect(isImpersonating()).toBe(true);
    });

    it("shows a generic message for a non-API failure", async () => {
        markImpersonating();
        mockedStopImpersonating.mockRejectedValue(new TypeError("boom"));
        mockLocation();
        const user = userEvent.setup();
        render(<ImpersonationBanner />);

        await user.click(screen.getByRole("button", { name: "Stop impersonating" }));

        expect(await screen.findByText("Could not stop impersonating.")).toBeInTheDocument();
    });
});
