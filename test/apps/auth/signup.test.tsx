// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../testUtils.js";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../../apps/www/_lib/passwordCriteria.js";

vi.mock("../../../apps/www/_lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/www/_lib/api.js")>();
    return {
        ...actual,
        beginRegistration: vi.fn(),
        verifyRegistration: vi.fn(),
        createProfile: vi.fn(),
        createPasswordSecret: vi.fn(),
        createUsernameAlias: vi.fn(),
        getPasswordRequirements: vi.fn(),
        setAuthToken: vi.fn(),
    };
});

import {
    ApiRequestError,
    beginRegistration,
    createPasswordSecret,
    createProfile,
    createUsernameAlias,
    getPasswordRequirements,
    setAuthToken,
    verifyRegistration,
} from "../../../apps/www/_lib/api.js";
import SignUpPage from "../../../apps/www/auth/signup/index.js";

const mockedBeginRegistration = vi.mocked(beginRegistration);
const mockedVerifyRegistration = vi.mocked(verifyRegistration);
const mockedCreateProfile = vi.mocked(createProfile);
const mockedCreatePasswordSecret = vi.mocked(createPasswordSecret);
const mockedCreateUsernameAlias = vi.mocked(createUsernameAlias);
const mockedGetPasswordRequirements = vi.mocked(getPasswordRequirements);
const mockedSetAuthToken = vi.mocked(setAuthToken);

beforeEach(() => {
    mockedGetPasswordRequirements.mockResolvedValue(FALLBACK_PASSWORD_REQUIREMENTS);
});

/** Advances a freshly-rendered SignUpPage from the identifier step through to the profile step. */
async function advanceToProfileStep(user: ReturnType<typeof userEvent.setup>) {
    mockedBeginRegistration.mockResolvedValueOnce({});
    mockedVerifyRegistration.mockResolvedValueOnce({ token: "tok-123", user: { uid: "u1", roles: [], scopes: [] } });

    render(<SignUpPage />);
    await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Check your inbox");

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Tell us about yourself");
}

describe("SignUpPage — identifier step", () => {
    it("submits an e-mail identifier and advances to the code step", async () => {
        const user = userEvent.setup();
        mockedBeginRegistration.mockResolvedValueOnce({});
        render(<SignUpPage />);

        await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await screen.findByText("Check your inbox");
        expect(mockedBeginRegistration).toHaveBeenCalledWith("email", "a@example.com");
    });

    it("toggles to phone and back, clearing the identifier and swapping labels", async () => {
        const user = userEvent.setup();
        render(<SignUpPage />);

        await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Use a phone number instead" }));
        expect(screen.getByLabelText("Phone number")).toHaveValue("");

        await user.click(screen.getByRole("button", { name: "Use an e-mail address instead" }));
        expect(screen.getByLabelText("E-mail address")).toBeInTheDocument();
    });

    it("submits a phone identifier", async () => {
        const user = userEvent.setup();
        mockedBeginRegistration.mockResolvedValueOnce({});
        render(<SignUpPage />);

        await user.click(screen.getByRole("button", { name: "Use a phone number instead" }));
        await user.type(screen.getByLabelText("Phone number"), "+15551234567");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await screen.findByText("Check your messages");
        expect(mockedBeginRegistration).toHaveBeenCalledWith("phone", "+15551234567");
    });

    it("shows the ApiRequestError message when starting registration fails", async () => {
        const user = userEvent.setup();
        mockedBeginRegistration.mockRejectedValueOnce(new ApiRequestError("Already registered.", 409));
        render(<SignUpPage />);

        await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Already registered.");
    });

    it("shows a generic message when starting registration fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedBeginRegistration.mockRejectedValueOnce(new TypeError("network down"));
        render(<SignUpPage />);

        await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignUpPage — code step", () => {
    async function advanceToCodeStep(user: ReturnType<typeof userEvent.setup>) {
        mockedBeginRegistration.mockResolvedValueOnce({});
        render(<SignUpPage />);
        await user.type(screen.getByLabelText("E-mail address"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await screen.findByText("Check your inbox");
    }

    it("strips non-digit characters from the code input", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        await user.type(screen.getByLabelText("Verification code"), "12a3b456");
        expect(screen.getByLabelText("Verification code")).toHaveValue("123456");
    });

    it("resends the code without changing steps", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedBeginRegistration.mockResolvedValueOnce({});
        await user.click(screen.getByRole("button", { name: "Resend" }));
        await waitFor(() => expect(mockedBeginRegistration).toHaveBeenCalledTimes(2));
        expect(screen.getByText("Check your inbox")).toBeInTheDocument();
    });

    it("shows an ApiRequestError message when resending fails", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedBeginRegistration.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));
        await user.click(screen.getByRole("button", { name: "Resend" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    });

    it("shows a generic message when resending fails with a non-API error", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedBeginRegistration.mockRejectedValueOnce(new TypeError("boom"));
        await user.click(screen.getByRole("button", { name: "Resend" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("verifies the code, stores the token, and advances to the profile step", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedVerifyRegistration.mockResolvedValueOnce({ token: "tok-123", user: { uid: "u1", roles: [], scopes: [] } });

        await user.type(screen.getByLabelText("Verification code"), "123456");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        await screen.findByText("Tell us about yourself");
        expect(mockedVerifyRegistration).toHaveBeenCalledWith("email", "a@example.com", "123456");
        expect(mockedSetAuthToken).toHaveBeenCalledWith("tok-123");
    });

    it("shows the ApiRequestError message when verification fails", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedVerifyRegistration.mockRejectedValueOnce(new ApiRequestError("Invalid code.", 400));

        await user.type(screen.getByLabelText("Verification code"), "000000");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid code.");
    });

    it("shows a generic message when verification fails with a non-API error", async () => {
        const user = userEvent.setup();
        await advanceToCodeStep(user);
        mockedVerifyRegistration.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Verification code"), "000000");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignUpPage — profile step", () => {
    it("creates a profile with no password and redirects to /account", async () => {
        const user = userEvent.setup();
        const location = mockLocation();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockResolvedValueOnce({});

        await user.type(screen.getByLabelText("Given name"), "Ada");
        await user.type(screen.getByLabelText("Family name"), "Lovelace");
        await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedCreateProfile).toHaveBeenCalledWith({
            givenName: "Ada",
            familyName: "Lovelace",
            birthdate: "1990-01-01",
            contacts: [{ contact: "a@example.com", type: "email", verified: true }],
        });
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("creates a username alias when one is provided", async () => {
        const user = userEvent.setup();
        const location = mockLocation();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockResolvedValueOnce({});
        mockedCreateUsernameAlias.mockResolvedValueOnce({});

        await user.type(screen.getByLabelText("Username (optional)"), "coolname");
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedCreateUsernameAlias).toHaveBeenCalledWith("coolname");
    });

    it("does not attempt to create a username alias when left blank", async () => {
        const user = userEvent.setup();
        const location = mockLocation();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockResolvedValueOnce({});

        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedCreateUsernameAlias).not.toHaveBeenCalled();
    });

    it("shows the ApiRequestError message when creating the username alias fails", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockResolvedValueOnce({});
        mockedCreateUsernameAlias.mockRejectedValueOnce(new ApiRequestError("Username taken.", 409));

        await user.type(screen.getByLabelText("Username (optional)"), "taken");
        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Username taken.");
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("shows the live password criteria checklist once typing starts", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        expect(screen.getByText(/Leave blank to add a password later/)).toBeInTheDocument();
        await user.type(screen.getByLabelText("Password (optional)"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });

    it("blocks submission with an inline error when the password doesn't meet requirements", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        await user.type(screen.getByLabelText("Password (optional)"), "weak");
        expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    });

    it("re-validates weak-password strength on submit even if force-submitted", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        await user.type(screen.getByLabelText("Password (optional)"), "weak");
        const form = screen.getByRole("button", { name: "Create account" }).closest("form")!;
        fireEvent.submit(form);

        expect(await screen.findByRole("alert")).toHaveTextContent("Password does not meet the requirements below.");
        expect(mockedCreateProfile).not.toHaveBeenCalled();
    });

    it("shows a mismatch error and blocks submission when confirmation doesn't match", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        await user.type(screen.getByLabelText("Password (optional)"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm password"), "Different1!");

        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    });

    it("re-validates the mismatch on submit even if the (normally disabled) form is force-submitted", async () => {
        // The submit button is disabled while passwords mismatch, so a real click can never fire the
        // handler — this exercises handleProfileSubmit's own defensive re-check directly, bypassing the
        // UI-level disabled state the same way a browser's native form submission could (e.g. pressing
        // Enter while focus is outside the disabled button).
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        await user.type(screen.getByLabelText("Password (optional)"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm password"), "Different1!");

        const form = screen.getByRole("button", { name: "Create account" }).closest("form")!;
        fireEvent.submit(form);

        expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
        expect(mockedCreateProfile).not.toHaveBeenCalled();
    });

    it("creates a profile and a password secret when a valid password is confirmed", async () => {
        const user = userEvent.setup();
        const location = mockLocation();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockResolvedValueOnce({});
        mockedCreatePasswordSecret.mockResolvedValueOnce({});

        await user.type(screen.getByLabelText("Password (optional)"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedCreatePasswordSecret).toHaveBeenCalledWith("Sup3r$ecret1");
    });

    it("shows the ApiRequestError message when profile creation fails", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockRejectedValueOnce(new ApiRequestError("Could not create profile.", 400));

        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not create profile.");
    });

    it("shows a generic message when profile creation fails with a non-API error", async () => {
        const user = userEvent.setup();
        await advanceToProfileStep(user);
        mockedCreateProfile.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignUpPage — password requirements fetch failure", () => {
    it("keeps the fallback requirements when GET /secrets/password fails", async () => {
        mockedGetPasswordRequirements.mockReset();
        mockedGetPasswordRequirements.mockRejectedValueOnce(new Error("offline"));
        const user = userEvent.setup();
        await advanceToProfileStep(user);

        await user.type(screen.getByLabelText("Password (optional)"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });
});
