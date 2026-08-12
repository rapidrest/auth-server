// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return {
        ...actual,
        beginElevationChallenge: vi.fn(),
        completeElevationChallenge: vi.fn(),
        completeElevationFido2: vi.fn(),
        elevateWithPassword: vi.fn(),
        listElevationMethods: vi.fn(),
    };
});

import { startAuthentication } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    beginElevationChallenge,
    completeElevationChallenge,
    completeElevationFido2,
    ElevationMethod,
    elevateWithPassword,
    listElevationMethods,
} from "../../../apps/shared/lib/api.js";
import { isElevationRequested, requestElevation, resolveElevation } from "../../../apps/shared/lib/elevation.js";
import ElevationHost from "../../../apps/shared/components/elevation/ElevationHost.js";

const mockedStartAuthentication = vi.mocked(startAuthentication);
const mockedBegin = vi.mocked(beginElevationChallenge);
const mockedCompleteCode = vi.mocked(completeElevationChallenge);
const mockedCompleteFido2 = vi.mocked(completeElevationFido2);
const mockedElevateWithPassword = vi.mocked(elevateWithPassword);
const mockedListMethods = vi.mocked(listElevationMethods);

const TOTP_METHOD: ElevationMethod = { id: "secret-totp-1", type: "totp", data: {} };
const FIDO2_METHOD: ElevationMethod = { id: "secret-fido2-1", type: "fido2", data: {} };
const OTP_METHOD: ElevationMethod = { id: "alias-otp-1", type: "otp", data: { contact: "j***n@example.com" } };
const OTP_METHOD_NO_CONTACT: ElevationMethod = { id: "alias-otp-2", type: "otp", data: {} };

const AUTH_RESULT = { token: "tok-123", user: { uid: "u1", version: 1, roles: [], scopes: [] } };

/**
 * `requestElevation()`/`resolveElevation()` mutate `ElevationHost`'s external store directly, standing in
 * for what would otherwise be `apiFetch` (open) or a challenge response settling (close) — neither goes
 * through a rendered user interaction the way `userEvent` calls do, so each needs its own `act()` to keep
 * React's state-update warnings quiet.
 */
function open(): Promise<boolean> {
    let result!: Promise<boolean>;
    act(() => {
        result = requestElevation();
    });
    return result;
}

function close(elevated: boolean): void {
    act(() => {
        resolveElevation(elevated);
    });
}

afterEach(() => {
    // Guard against a failed assertion leaving a prompt pending mid-test — see elevation.test.ts.
    if (isElevationRequested()) {
        close(false);
    }
});

describe("ElevationHost — closed", () => {
    it("renders nothing until an elevation is requested", () => {
        render(<ElevationHost />);
        expect(screen.queryByText(/Confirm it/)).not.toBeInTheDocument();
    });

    it("renders nothing server-side, regardless of client state, via useSyncExternalStore's server snapshot", () => {
        // Mirrors `_layout.test.tsx`'s use of `renderToStaticMarkup` — the same kind of call the SSR
        // renderer itself makes, which is what actually exercises `useSyncExternalStore`'s third
        // (`getServerSnapshot`) argument rather than its client `isElevationRequested` snapshot.
        expect(renderToStaticMarkup(<ElevationHost />)).toBe("");
    });
});

describe("ElevationHost — loading methods", () => {
    it("lists the caller's enrolled methods once loaded", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD, FIDO2_METHOD, OTP_METHOD, OTP_METHOD_NO_CONTACT]);
        render(<ElevationHost />);

        void open();

        expect(await screen.findByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Hardware key/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: `Code to ${OTP_METHOD.data.contact}` })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "One-time code" })).toBeInTheDocument();
    });

    it("falls back to the password form when the caller has no enrolled methods", async () => {
        mockedListMethods.mockResolvedValueOnce([]);
        render(<ElevationHost />);

        void open();

        expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when loading methods fails", async () => {
        mockedListMethods.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));
        render(<ElevationHost />);

        void open();

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    });

    it("shows a generic message when loading methods fails with a non-API error", async () => {
        mockedListMethods.mockRejectedValueOnce(new TypeError("boom"));
        render(<ElevationHost />);

        void open();

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your elevation methods.");
    });

    it("reloads fresh methods each time a new elevation is requested", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        render(<ElevationHost />);
        const first = open();
        await screen.findByRole("button", { name: /^Authenticator app/ });
        close(false);
        await first;

        mockedListMethods.mockResolvedValueOnce([]);
        void open();

        expect(await screen.findByLabelText("Password")).toBeInTheDocument();
        expect(mockedListMethods).toHaveBeenCalledTimes(2);
    });
});

describe("ElevationHost — totp/otp code challenge", () => {
    it("completes elevation via TOTP and resolves the pending promise true", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        mockedCompleteCode.mockResolvedValueOnce(AUTH_RESULT);
        render(<ElevationHost />);
        const promise = open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));
        expect(mockedBegin).toHaveBeenCalledWith(TOTP_METHOD.id);

        await user.type(await screen.findByLabelText("Authenticator code"), "654321");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(mockedCompleteCode).toHaveBeenCalledWith("654321");
        await expect(promise).resolves.toBe(true);
        expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
    });

    it("labels the code field as a one-time code for an otp method", async () => {
        mockedListMethods.mockResolvedValueOnce([OTP_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: `Code to ${OTP_METHOD.data.contact}` }));

        expect(await screen.findByLabelText("One-time code")).toBeInTheDocument();
    });

    it("shows a fixed message on an invalid/expired code", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        mockedCompleteCode.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));

        await user.type(await screen.findByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message when code verification fails with a non-API error", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        mockedCompleteCode.mockRejectedValueOnce(new TypeError("boom"));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));

        await user.type(await screen.findByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows an error and stays on the method list when beginning the challenge fails", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
        expect(screen.getByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
    });

    it("shows a generic message when beginning the challenge fails with a non-API error", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockRejectedValueOnce(new TypeError("boom"));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("ElevationHost — fido2 challenge", () => {
    it("completes elevation via a hardware key and resolves the pending promise true", async () => {
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedListMethods.mockResolvedValueOnce([FIDO2_METHOD]);
        mockedBegin.mockResolvedValueOnce(options);
        mockedStartAuthentication.mockResolvedValueOnce(response as any);
        mockedCompleteFido2.mockResolvedValueOnce(AUTH_RESULT);
        render(<ElevationHost />);
        const promise = open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: /^Hardware key/ }));
        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(mockedStartAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
        expect(mockedCompleteFido2).toHaveBeenCalledWith(response);
        await expect(promise).resolves.toBe(true);
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        mockedListMethods.mockResolvedValueOnce([FIDO2_METHOD]);
        mockedBegin.mockResolvedValueOnce({ challenge: "c" });
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Hardware key/ }));

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key confirmation was cancelled.");
    });

    it("shows a fixed message when completion fails with an ApiRequestError", async () => {
        mockedListMethods.mockResolvedValueOnce([FIDO2_METHOD]);
        mockedBegin.mockResolvedValueOnce({ challenge: "c" });
        mockedStartAuthentication.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedCompleteFido2.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Hardware key/ }));

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key confirmation failed.");
    });

    it("shows a generic message when the ceremony fails with a non-API, non-cancellation error", async () => {
        mockedListMethods.mockResolvedValueOnce([FIDO2_METHOD]);
        mockedBegin.mockResolvedValueOnce({ challenge: "c" });
        mockedStartAuthentication.mockRejectedValueOnce(new TypeError("boom"));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Hardware key/ }));

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("ElevationHost — password fallback", () => {
    it("completes elevation via password and resolves the pending promise true", async () => {
        mockedListMethods.mockResolvedValueOnce([]);
        mockedElevateWithPassword.mockResolvedValueOnce(AUTH_RESULT);
        render(<ElevationHost />);
        const promise = open();
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("Password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(mockedElevateWithPassword).toHaveBeenCalledWith("hunter2");
        await expect(promise).resolves.toBe(true);
        expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    });

    it("shows a fixed message on an incorrect password", async () => {
        mockedListMethods.mockResolvedValueOnce([]);
        mockedElevateWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password.");
    });

    it("shows a generic message when password elevation fails with a non-API error", async () => {
        mockedListMethods.mockResolvedValueOnce([]);
        mockedElevateWithPassword.mockRejectedValueOnce(new TypeError("boom"));
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("ElevationHost — navigation and cancellation", () => {
    it("'Choose a different method' is offered with multiple methods and returns to the list without a new request", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD, FIDO2_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));
        await screen.findByLabelText("Authenticator code");

        await user.click(screen.getByRole("button", { name: "Choose a different method" }));

        expect(screen.getByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Hardware key/ })).toBeInTheDocument();
        expect(mockedBegin).toHaveBeenCalledTimes(1);
    });

    it("does not offer 'Choose a different method' when only one method is enrolled", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        mockedBegin.mockResolvedValueOnce({});
        render(<ElevationHost />);
        void open();
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: /^Authenticator app/ }));
        await screen.findByLabelText("Authenticator code");

        expect(screen.queryByRole("button", { name: "Choose a different method" })).not.toBeInTheDocument();
    });

    it("'Cancel' resolves the pending promise false and closes the prompt", async () => {
        mockedListMethods.mockResolvedValueOnce([TOTP_METHOD]);
        render(<ElevationHost />);
        const promise = open();
        const user = userEvent.setup();
        await screen.findByRole("button", { name: /^Authenticator app/ });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        await expect(promise).resolves.toBe(false);
        expect(screen.queryByRole("button", { name: /^Authenticator app/ })).not.toBeInTheDocument();
    });
});
