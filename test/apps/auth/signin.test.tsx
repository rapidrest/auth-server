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
        discoverAuthMethods: vi.fn(),
        getFido2Challenge: vi.fn(),
        getOtpChallenge: vi.fn(),
        getPasskeyChallenge: vi.fn(),
        setAuthToken: vi.fn(),
        signInWithOtp: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithTotp: vi.fn(),
        verifyFido2SignIn: vi.fn(),
        verifyPasskeySignIn: vi.fn(),
    };
});

import { startAuthentication } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    DiscoverResult,
    discoverAuthMethods,
    getFido2Challenge,
    getOtpChallenge,
    getPasskeyChallenge,
    setAuthToken,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyPasskeySignIn,
} from "../../../apps/www/_lib/api.js";
import SignInPage from "../../../apps/www/auth/signin/index.js";

const mockedStartAuthentication = vi.mocked(startAuthentication);
const mockedDiscoverAuthMethods = vi.mocked(discoverAuthMethods);
const mockedGetFido2Challenge = vi.mocked(getFido2Challenge);
const mockedGetOtpChallenge = vi.mocked(getOtpChallenge);
const mockedGetPasskeyChallenge = vi.mocked(getPasskeyChallenge);
const mockedSetAuthToken = vi.mocked(setAuthToken);
const mockedSignInWithOtp = vi.mocked(signInWithOtp);
const mockedSignInWithPassword = vi.mocked(signInWithPassword);
const mockedSignInWithTotp = vi.mocked(signInWithTotp);
const mockedVerifyFido2SignIn = vi.mocked(verifyFido2SignIn);
const mockedVerifyPasskeySignIn = vi.mocked(verifyPasskeySignIn);

const AUTH_RESULT = { token: "tok-123", user: { uid: "u1", roles: [], scopes: [] } };

const ALL_METHODS: DiscoverResult = {
    password: true,
    totp: true,
    passkey: true,
    fido2: true,
    otp: [{ contact: "j***n@example.com", type: "email" }],
};

const EMPTY_DISCOVER: DiscoverResult = { password: false, totp: false, passkey: false, fido2: false, otp: [] };

async function openMethodModal(
    user: ReturnType<typeof userEvent.setup>,
    discoverResult: DiscoverResult,
    identifier = "a@example.com",
) {
    mockedDiscoverAuthMethods.mockResolvedValueOnce(discoverResult);
    render(<SignInPage />);
    await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), identifier);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("dialog", { name: "Sign in" });
    expect(mockedDiscoverAuthMethods).toHaveBeenCalledWith(identifier);
}

describe("SignInPage — identifier step", () => {
    it("renders disabled OAuth buttons", () => {
        render(<SignInPage />);
        expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeDisabled();
    });

    it("calls discoverAuthMethods and opens the method-picker modal on submit", async () => {
        const user = userEvent.setup();
        await openMethodModal(user, ALL_METHODS, "a@example.com");
        expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });

    it("degrades to the empty result (generic message, no per-method breakdown) if discover itself throws", async () => {
        mockedDiscoverAuthMethods.mockRejectedValueOnce(new Error("network down"));
        const user = userEvent.setup();
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByText(/No sign-in methods are available/)).toBeInTheDocument();
        expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
});

describe("SignInPage — nothing available", () => {
    it("shows a single generic message and no method tabs", async () => {
        const user = userEvent.setup();
        await openMethodModal(user, EMPTY_DISCOVER);
        expect(screen.getByText(/No sign-in methods are available/)).toBeInTheDocument();
        expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
});

describe("SignInPage — method tabs", () => {
    it("defaults to passkey (listed first) and switches between all five methods", async () => {
        const user = userEvent.setup();
        await openMethodModal(user, ALL_METHODS);

        expect(screen.getByRole("tab", { name: "Passkey" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("button", { name: "Continue with passkey" })).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Password" }));
        expect(screen.getByLabelText("Password")).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Authenticator app" }));
        expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "One-time code" }));
        expect(screen.getByLabelText("E-mail or phone")).toBeInTheDocument();

        await user.click(screen.getByRole("tab", { name: "Security key" }));
        expect(screen.getByRole("button", { name: "Continue with security key" })).toBeInTheDocument();
    });

    it("only renders tabs for methods discover actually returned as available", async () => {
        const user = userEvent.setup();
        await openMethodModal(user, { password: true, totp: false, passkey: false, fido2: false, otp: [] });

        expect(screen.getByRole("tab", { name: "Password" })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Passkey" })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Authenticator app" })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "One-time code" })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Security key" })).not.toBeInTheDocument();
    });

    it("clears the input fields and error when the modal is closed and reopened", async () => {
        const user = userEvent.setup();
        await openMethodModal(user, ALL_METHODS, "a@example.com");
        await user.click(screen.getByRole("tab", { name: "Password" }));
        await user.type(screen.getByLabelText("Password"), "hunter2");
        mockedSignInWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByRole("alert")).toBeInTheDocument();

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        mockedDiscoverAuthMethods.mockResolvedValueOnce(ALL_METHODS);
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await screen.findByRole("dialog", { name: "Sign in" });
        await user.click(screen.getByRole("tab", { name: "Password" }));
        expect(screen.getByLabelText("Password")).toHaveValue("");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

describe("SignInPage — password method", () => {
    async function goToPassword(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
        await openMethodModal(user, ALL_METHODS, identifier);
        await user.click(screen.getByRole("tab", { name: "Password" }));
    }

    it("signs in successfully and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToPassword(user, "a@example.com");
        mockedSignInWithPassword.mockResolvedValueOnce(AUTH_RESULT);

        await user.type(screen.getByLabelText("Password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithPassword).toHaveBeenCalledWith("a@example.com", "hunter2");
        expect(mockedSetAuthToken).toHaveBeenCalledWith("tok-123");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToPassword(user);
        mockedSignInWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect account ID or password.");
    });

    it("shows a generic message on a non-API error", async () => {
        const user = userEvent.setup();
        await goToPassword(user);
        mockedSignInWithPassword.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — totp method", () => {
    async function goToTotp(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
        await openMethodModal(user, ALL_METHODS, identifier);
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
        await goToTotp(user, "u1");
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

describe("SignInPage — otp method", () => {
    async function goToOtp(user: ReturnType<typeof userEvent.setup>, discoverResult = ALL_METHODS, identifier = "a@example.com") {
        await openMethodModal(user, discoverResult, identifier);
        await user.click(screen.getByRole("tab", { name: "One-time code" }));
    }

    it("shows an obfuscated hint (single contact) before the contact is typed", async () => {
        const user = userEvent.setup();
        await goToOtp(user, ALL_METHODS);
        expect(screen.getByText(/We can send a code to j\*\*\*n@example\.com\./)).toBeInTheDocument();
    });

    it("joins multiple obfuscated hints with 'or'", async () => {
        const user = userEvent.setup();
        await goToOtp(user, {
            ...ALL_METHODS,
            otp: [
                { contact: "j***n@example.com", type: "email" },
                { contact: "***1234", type: "phone" },
            ],
        });
        expect(screen.getByText(/We can send a code to j\*\*\*n@example\.com or \*\*\*1234\./)).toBeInTheDocument();
    });

    it("sends a challenge to the typed contact, then verifies the code and signs in", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockResolvedValueOnce({});

        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));

        expect(mockedGetOtpChallenge).toHaveBeenCalledWith("a@example.com");
        await screen.findByText("We sent a code to a@example.com.");

        mockedSignInWithOtp.mockResolvedValueOnce(AUTH_RESULT);
        await user.type(screen.getByLabelText("One-time code"), "1a2b3c");
        expect(screen.getByLabelText("One-time code")).toHaveValue("123");
        await user.type(screen.getByLabelText("One-time code"), "456");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithOtp).toHaveBeenCalledWith("a@example.com", "123456");
    });

    it("shows the ApiRequestError message when the challenge fails", async () => {
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));

        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    });

    it("shows a generic message when the challenge fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows a fixed message on an invalid code", async () => {
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockResolvedValueOnce({});
        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));
        await screen.findByText("We sent a code to a@example.com.");

        mockedSignInWithOtp.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        await user.type(screen.getByLabelText("One-time code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message when sign-in fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockResolvedValueOnce({});
        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));
        await screen.findByText("We sent a code to a@example.com.");

        mockedSignInWithOtp.mockRejectedValueOnce(new TypeError("boom"));
        await user.type(screen.getByLabelText("One-time code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("'Use a different contact' returns to the contact step, clearing the code and error", async () => {
        const user = userEvent.setup();
        await goToOtp(user);
        mockedGetOtpChallenge.mockResolvedValueOnce({});
        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));
        await screen.findByText("We sent a code to a@example.com.");
        mockedSignInWithOtp.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        await user.type(screen.getByLabelText("One-time code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        await screen.findByRole("alert");

        await user.click(screen.getByRole("button", { name: "Use a different contact" }));

        expect(screen.getByLabelText("E-mail or phone")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

describe("SignInPage — passkey method", () => {
    async function goToPasskey(user: ReturnType<typeof userEvent.setup>, identifier = "a@example.com") {
        await openMethodModal(user, ALL_METHODS, identifier);
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
        await openMethodModal(user, ALL_METHODS, identifier);
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
