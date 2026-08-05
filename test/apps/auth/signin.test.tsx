// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockLocation } from "../testUtils.js";

vi.mock("@simplewebauthn/browser", () => ({
    startAuthentication: vi.fn(),
}));

vi.mock("../../../apps/www/_lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/www/_lib/api.js")>();
    return {
        ...actual,
        getFido2Challenge: vi.fn(),
        getPasskeyChallenge: vi.fn(),
        setAuthToken: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithTotp: vi.fn(),
        verifyFido2SignIn: vi.fn(),
        verifyPasskeySignIn: vi.fn(),
    };
});

import { startAuthentication } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    getFido2Challenge,
    getPasskeyChallenge,
    setAuthToken,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyPasskeySignIn,
} from "../../../apps/www/_lib/api.js";
import SignInPage from "../../../apps/www/auth/signin/index.js";

const mockedStartAuthentication = vi.mocked(startAuthentication);
const mockedGetFido2Challenge = vi.mocked(getFido2Challenge);
const mockedGetPasskeyChallenge = vi.mocked(getPasskeyChallenge);
const mockedSetAuthToken = vi.mocked(setAuthToken);
const mockedSignInWithPassword = vi.mocked(signInWithPassword);
const mockedSignInWithTotp = vi.mocked(signInWithTotp);
const mockedVerifyFido2SignIn = vi.mocked(verifyFido2SignIn);
const mockedVerifyPasskeySignIn = vi.mocked(verifyPasskeySignIn);

const AUTH_RESULT = { token: "tok-123", user: { uid: "u1", roles: [], scopes: [] } };

async function advanceToMethodStep(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
    render(<SignInPage />);
    await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), identifier);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Choose how/);
}

describe("SignInPage — identifier step", () => {
    it("advances to the method step on submit", async () => {
        const user = userEvent.setup();
        await advanceToMethodStep(user, "a@example.com");
        expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });

    it("renders disabled OAuth buttons", () => {
        render(<SignInPage />);
        expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeDisabled();
    });
});

describe("SignInPage — method tabs", () => {
    it("defaults to the password tab and switches between all four methods", async () => {
        const user = userEvent.setup();
        await advanceToMethodStep(user);

        expect(screen.getByRole("tab", { name: "Password" })).toHaveAttribute("aria-selected", "true");

        await user.click(screen.getByRole("tab", { name: "Authenticator app" }));
        expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Passkey" }));
        expect(screen.getByRole("button", { name: "Continue with passkey" })).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Security key" }));
        expect(screen.getByRole("button", { name: "Continue with security key" })).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Password" }));
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("returns to the identifier step, preserving the identifier but clearing the password field", async () => {
        const user = userEvent.setup();
        await advanceToMethodStep(user, "a@example.com");
        await user.type(screen.getByLabelText("Password"), "hunter2");

        await user.click(screen.getByRole("button", { name: "Use a different account" }));

        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toHaveValue("a@example.com");

        await user.click(screen.getByRole("button", { name: "Continue" }));
        await screen.findByText(/Choose how/);
        expect(screen.getByLabelText("Password")).toHaveValue("");
    });
});

describe("SignInPage — password method", () => {
    it("signs in successfully and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await advanceToMethodStep(user, "a@example.com");
        mockedSignInWithPassword.mockResolvedValueOnce(AUTH_RESULT);

        await user.type(screen.getByLabelText("Password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithPassword).toHaveBeenCalledWith("a@example.com", "hunter2");
        expect(mockedSetAuthToken).toHaveBeenCalledWith("tok-123");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await advanceToMethodStep(user);
        mockedSignInWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect account ID or password.");
    });

    it("shows a generic message on a non-API error", async () => {
        const user = userEvent.setup();
        await advanceToMethodStep(user);
        mockedSignInWithPassword.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — totp method", () => {
    async function goToTotp(user: ReturnType<typeof userEvent.setup>) {
        await advanceToMethodStep(user);
        await user.click(screen.getByRole("tab", { name: "Authenticator app" }));
    }

    it("strips non-digits from the code field", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        await user.type(screen.getByLabelText("Authenticator code"), "12a3b456");
        expect(screen.getByLabelText("Authenticator code")).toHaveValue("123456");
    });

    it("signs in successfully and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await advanceToMethodStep(user, "u1");
        await user.click(screen.getByRole("tab", { name: "Authenticator app" }));
        mockedSignInWithTotp.mockResolvedValueOnce(AUTH_RESULT);

        await user.type(screen.getByLabelText("Authenticator code"), "654321");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithTotp).toHaveBeenCalledWith("u1", "654321");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        mockedSignInWithTotp.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(screen.getByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message on a non-API error", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        mockedSignInWithTotp.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — passkey method", () => {
    async function goToPasskey(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
        await advanceToMethodStep(user, identifier);
        await user.click(screen.getByRole("tab", { name: "Passkey" }));
    }

    it("completes the ceremony and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToPasskey(user, "a@example.com");
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetPasskeyChallenge.mockResolvedValueOnce(options);
        mockedStartAuthentication.mockResolvedValueOnce(response as any);
        mockedVerifyPasskeySignIn.mockResolvedValueOnce(AUTH_RESULT);

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedGetPasskeyChallenge).toHaveBeenCalledWith("a@example.com");
        expect(mockedStartAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
        expect(mockedVerifyPasskeySignIn).toHaveBeenCalledWith(response);
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyChallenge.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in was cancelled.");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyChallenge.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in failed.");
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyChallenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — fido2 method", () => {
    async function goToFido2(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
        await advanceToMethodStep(user, identifier);
        await user.click(screen.getByRole("tab", { name: "Security key" }));
    }

    it("completes the ceremony and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToFido2(user, "a@example.com");
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetFido2Challenge.mockResolvedValueOnce(options);
        mockedStartAuthentication.mockResolvedValueOnce(response as any);
        mockedVerifyFido2SignIn.mockResolvedValueOnce(AUTH_RESULT);

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedGetFido2Challenge).toHaveBeenCalledWith("a@example.com");
        expect(mockedVerifyFido2SignIn).toHaveBeenCalledWith(response);
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2Challenge.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Security key sign-in was cancelled.");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2Challenge.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Security key sign-in failed.");
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2Challenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});
