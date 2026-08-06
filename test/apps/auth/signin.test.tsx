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

const EMAIL_HINT = { contact: "j***n@example.com", type: "email" as const };
const PHONE_HINT = { contact: "***1234", type: "phone" as const };

const ALL_METHODS: DiscoverResult = {
    password: true,
    totp: true,
    passkey: true,
    fido2: true,
    otp: [EMAIL_HINT],
};

const EMPTY_DISCOVER: DiscoverResult = { password: false, totp: false, passkey: false, fido2: false, otp: [] };

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Drives the identifier step to completion, landing on the method-list step (no modal involved). */
async function goToMethods(
    user: ReturnType<typeof userEvent.setup>,
    discoverResult: DiscoverResult,
    identifier = "a@example.com",
) {
    mockedDiscoverAuthMethods.mockResolvedValueOnce(discoverResult);
    render(<SignInPage />);
    await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), identifier);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Choose how/);
    expect(mockedDiscoverAuthMethods).toHaveBeenCalledWith(identifier);
}

/** Drives all the way to a given fixed method's challenge screen by clicking its entry in the method list. */
async function goToChallenge(
    user: ReturnType<typeof userEvent.setup>,
    methodLabel: string,
    discoverResult: DiscoverResult = ALL_METHODS,
    identifier = "a@example.com",
) {
    await goToMethods(user, discoverResult, identifier);
    await user.click(screen.getByRole("button", { name: new RegExp(`^${methodLabel}`) }));
}

/** Drives all the way to a given OTP contact's own challenge screen, by clicking its specific list entry. */
async function goToOtpChallenge(
    user: ReturnType<typeof userEvent.setup>,
    hint: { contact: string; type: "email" | "phone" },
    discoverResult: DiscoverResult = ALL_METHODS,
    identifier = "a@example.com",
) {
    await goToMethods(user, discoverResult, identifier);
    const typeLabel = hint.type === "email" ? "Email" : "Phone";
    await user.click(screen.getByRole("button", { name: new RegExp(`^${typeLabel}: ${escapeRegExp(hint.contact)}`) }));
}

describe("SignInPage — identifier step", () => {
    it("renders disabled OAuth buttons", () => {
        render(<SignInPage />);
        expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeDisabled();
    });

    it("calls discoverAuthMethods and advances to the method-list step on submit", async () => {
        const user = userEvent.setup();
        await goToMethods(user, ALL_METHODS, "a@example.com");
        expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });

    it("degrades to the empty result (generic message, no method list) if discover itself throws", async () => {
        mockedDiscoverAuthMethods.mockRejectedValueOnce(new Error("network down"));
        const user = userEvent.setup();
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByText(/No sign-in methods are available/)).toBeInTheDocument();
    });
});

describe("SignInPage — nothing available", () => {
    it("shows a single generic message and no method list", async () => {
        const user = userEvent.setup();
        await goToMethods(user, EMPTY_DISCOVER);
        expect(screen.getByText(/No sign-in methods are available/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Password|Passkey|One-time code/ })).not.toBeInTheDocument();
    });
});

describe("SignInPage — method list", () => {
    it("lists passkey first, and only the methods discover actually returned as available", async () => {
        const user = userEvent.setup();
        await goToMethods(user, ALL_METHODS);

        const items = screen.getAllByRole("button").filter((b) => b.className.includes("rr-method-list-item"));
        const strip = (s: string) => s.replace(/[^\w\- ]/g, "").trim();
        expect(items.map((b) => strip(b.textContent || ""))).toEqual([
            "Passkey",
            "Password",
            "Authenticator app",
            strip(`Email: ${EMAIL_HINT.contact}`),
            "Security key",
        ]);
    });

    it("lists one entry per discovered OTP contact, not a single combined entry", async () => {
        const user = userEvent.setup();
        await goToMethods(user, { ...EMPTY_DISCOVER, otp: [EMAIL_HINT, PHONE_HINT] });

        expect(screen.getByRole("button", { name: new RegExp(`^Email: ${escapeRegExp(EMAIL_HINT.contact)}`) })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: new RegExp(`^Phone: ${escapeRegExp(PHONE_HINT.contact)}`) })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^One-time code/ })).not.toBeInTheDocument();
    });

    it("only lists methods discover returned as available", async () => {
        const user = userEvent.setup();
        await goToMethods(user, { password: true, totp: false, passkey: false, fido2: false, otp: [] });

        expect(screen.getByRole("button", { name: /^Password/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Passkey/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Authenticator app/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Email:|^Phone:/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Security key/ })).not.toBeInTheDocument();
    });

    it("clicking a method advances to its challenge screen", async () => {
        const user = userEvent.setup();
        await goToMethods(user, ALL_METHODS);

        await user.click(screen.getByRole("button", { name: /^Password/ }));

        expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("'Use a different account' returns to the identifier step", async () => {
        const user = userEvent.setup();
        await goToMethods(user, ALL_METHODS, "a@example.com");

        await user.click(screen.getByRole("button", { name: "Use a different account" }));

        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toHaveValue("a@example.com");
    });

    it("'Choose a different method' returns from the challenge screen to the method list, clearing fields", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Password");
        await user.type(screen.getByLabelText("Password"), "hunter2");
        mockedSignInWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByRole("alert")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Choose a different method" }));

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Password/ })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /^Password/ }));
        expect(screen.getByLabelText("Password")).toHaveValue("");
    });
});

describe("SignInPage — password method", () => {
    it("signs in successfully and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToChallenge(user, "Password", ALL_METHODS, "a@example.com");
        mockedSignInWithPassword.mockResolvedValueOnce(AUTH_RESULT);

        await user.type(screen.getByLabelText("Password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithPassword).toHaveBeenCalledWith("a@example.com", "hunter2");
        expect(mockedSetAuthToken).toHaveBeenCalledWith("tok-123");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Password");
        mockedSignInWithPassword.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect account ID or password.");
    });

    it("shows a generic message on a non-API error", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Password");
        mockedSignInWithPassword.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Password"), "wrong");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — totp method", () => {
    it("strips non-digits from the code field", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Authenticator app");
        await user.type(screen.getByLabelText("Authenticator code"), "12a3b456");
        expect(screen.getByLabelText("Authenticator code")).toHaveValue("123456");
    });

    it("signs in successfully and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToChallenge(user, "Authenticator app", ALL_METHODS, "u1");
        mockedSignInWithTotp.mockResolvedValueOnce(AUTH_RESULT);

        await user.type(screen.getByLabelText("Authenticator code"), "654321");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithTotp).toHaveBeenCalledWith("u1", "654321");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Authenticator app");
        mockedSignInWithTotp.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(screen.getByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message on a non-API error", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Authenticator app");
        mockedSignInWithTotp.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — otp method", () => {
    it("shows the hint scoped to whichever entry was clicked, and the type as the heading", async () => {
        const user = userEvent.setup();
        await goToOtpChallenge(user, EMAIL_HINT, { ...EMPTY_DISCOVER, otp: [EMAIL_HINT, PHONE_HINT] });

        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText(/We can send a code to j\*\*\*n@example\.com\./)).toBeInTheDocument();
        expect(screen.queryByText(/\*\*\*1234/)).not.toBeInTheDocument();
    });

    it("shows the phone entry's own hint when the phone entry is clicked instead", async () => {
        const user = userEvent.setup();
        await goToOtpChallenge(user, PHONE_HINT, { ...EMPTY_DISCOVER, otp: [EMAIL_HINT, PHONE_HINT] });

        expect(screen.getByText("Phone")).toBeInTheDocument();
        expect(screen.getByText(/We can send a code to \*\*\*1234\./)).toBeInTheDocument();
        expect(screen.queryByText(/j\*\*\*n@example\.com/)).not.toBeInTheDocument();
    });

    it("sends a challenge to the typed contact, then verifies the code and signs in", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToOtpChallenge(user, EMAIL_HINT);
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
        await goToOtpChallenge(user, EMAIL_HINT);
        mockedGetOtpChallenge.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));

        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    });

    it("shows a generic message when the challenge fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToOtpChallenge(user, EMAIL_HINT);
        mockedGetOtpChallenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("E-mail or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Send code" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows a fixed message on an invalid code", async () => {
        const user = userEvent.setup();
        await goToOtpChallenge(user, EMAIL_HINT);
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
        await goToOtpChallenge(user, EMAIL_HINT);
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
        await goToOtpChallenge(user, EMAIL_HINT);
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

    it("'Choose a different method' clears the selected OTP hint", async () => {
        const user = userEvent.setup();
        await goToOtpChallenge(user, EMAIL_HINT, { ...EMPTY_DISCOVER, otp: [EMAIL_HINT, PHONE_HINT] });
        expect(screen.getByText(/j\*\*\*n@example\.com/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Choose a different method" }));

        await user.click(
            screen.getByRole("button", { name: new RegExp(`^Phone: ${escapeRegExp(PHONE_HINT.contact)}`) }),
        );

        expect(screen.getByText(/We can send a code to \*\*\*1234\./)).toBeInTheDocument();
    });
});

describe("SignInPage — passkey method", () => {
    it("completes the ceremony and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToChallenge(user, "Passkey", ALL_METHODS, "a@example.com");
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
        await goToChallenge(user, "Passkey");
        mockedGetPasskeyChallenge.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in was cancelled.");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Passkey");
        mockedGetPasskeyChallenge.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in failed.");
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Passkey");
        mockedGetPasskeyChallenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Continue with passkey" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});

describe("SignInPage — fido2 method", () => {
    it("completes the ceremony and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToChallenge(user, "Security key", ALL_METHODS, "a@example.com");
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
        await goToChallenge(user, "Security key");
        mockedGetFido2Challenge.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Security key sign-in was cancelled.");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Security key");
        mockedGetFido2Challenge.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Security key sign-in failed.");
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Security key");
        mockedGetFido2Challenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});
