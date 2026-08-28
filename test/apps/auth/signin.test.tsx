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

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return {
        ...actual,
        beginMfaChallenge: vi.fn(),
        completeOAuthSignIn: vi.fn(),
        discoverAuthMethods: vi.fn(),
        getFido2Challenge: vi.fn(),
        getOAuthAuthorizeURL: vi.fn(),
        getOtpChallenge: vi.fn(),
        getPasskeyChallenge: vi.fn(),
        signInWithOtp: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithTotp: vi.fn(),
        verifyFido2SignIn: vi.fn(),
        verifyMfaCode: vi.fn(),
        verifyMfaFido2: vi.fn(),
        verifyPasskeySignIn: vi.fn(),
    };
});

import { startAuthentication } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    beginMfaChallenge,
    completeOAuthSignIn,
    DiscoverResult,
    discoverAuthMethods,
    getFido2Challenge,
    getOAuthAuthorizeURL,
    getOtpChallenge,
    getPasskeyChallenge,
    MfaMethod,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyMfaCode,
    verifyMfaFido2,
    verifyPasskeySignIn,
} from "../../../apps/shared/lib/api.js";
import SignInPage from "../../../apps/www/auth/signin/index.js";

const mockedStartAuthentication = vi.mocked(startAuthentication);
const mockedBeginMfaChallenge = vi.mocked(beginMfaChallenge);
const mockedCompleteOAuthSignIn = vi.mocked(completeOAuthSignIn);
const mockedDiscoverAuthMethods = vi.mocked(discoverAuthMethods);
const mockedGetFido2Challenge = vi.mocked(getFido2Challenge);
const mockedGetOAuthAuthorizeURL = vi.mocked(getOAuthAuthorizeURL);
const mockedGetOtpChallenge = vi.mocked(getOtpChallenge);
const mockedGetPasskeyChallenge = vi.mocked(getPasskeyChallenge);
const mockedSignInWithOtp = vi.mocked(signInWithOtp);
const mockedSignInWithPassword = vi.mocked(signInWithPassword);
const mockedSignInWithTotp = vi.mocked(signInWithTotp);
const mockedVerifyFido2SignIn = vi.mocked(verifyFido2SignIn);
const mockedVerifyMfaCode = vi.mocked(verifyMfaCode);
const mockedVerifyMfaFido2 = vi.mocked(verifyMfaFido2);
const mockedVerifyPasskeySignIn = vi.mocked(verifyPasskeySignIn);

const AUTH_RESULT = { token: "tok-123", user: { uid: "u1", version: 1, roles: [], scopes: [] } };

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
    it("renders enabled OAuth buttons for every provider", () => {
        render(<SignInPage />);
        expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Continue with Facebook" })).toBeEnabled();
    });

    it("calls discoverAuthMethods and advances to the method-list step on submit", async () => {
        const user = userEvent.setup();
        await goToMethods(user, ALL_METHODS, "a@example.com");
        expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });

    it("shows a fixed message and stays on the identifier step when discover throws an ApiRequestError", async () => {
        mockedDiscoverAuthMethods.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));
        const user = userEvent.setup();
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });

    it("shows a generic message and stays on the identifier step when discover throws a non-API error", async () => {
        mockedDiscoverAuthMethods.mockRejectedValueOnce(new Error("network down"));
        const user = userEvent.setup();
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });
});

describe("SignInPage — OAuth buttons", () => {
    // Each button fetches its authorization URL through the API first (never a raw top-level
    // navigation straight to a backend route that itself issues a redirect) — this way a failure to
    // build that URL surfaces as a normal ApiRequestError this page can render inline, same as every
    // other sign-in method's error handling, instead of the browser landing on the API's raw
    // response with no chance for React to react. Only once a URL actually comes back does the real
    // top-level navigation happen. The provider name rides along as the `state` query param — see
    // "SignInPage — OAuth callback" below for why: the provider redirects the browser back to this
    // same sign-in page (not the API) with that same `state` value echoed back, and that's how the
    // page later knows which backend route to forward the returned code to.
    it("fetches the authorization URL and navigates to it when Continue with Google is clicked", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockResolvedValueOnce({ url: "https://accounts.google.com/o/oauth2/v2/auth?..." });
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Google" }));
        expect(mockedGetOAuthAuthorizeURL).toHaveBeenCalledWith("google", "google");
        await waitFor(() => expect(location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?..."));
    });

    it("fetches the authorization URL and navigates to it when Continue with Microsoft is clicked", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockResolvedValueOnce({ url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..." });
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Microsoft" }));
        expect(mockedGetOAuthAuthorizeURL).toHaveBeenCalledWith("microsoft", "microsoft");
        await waitFor(() => expect(location.href).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?..."));
    });

    it("fetches the authorization URL and navigates to it when Continue with Apple is clicked", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockResolvedValueOnce({ url: "https://appleid.apple.com/auth/authorize?..." });
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Apple" }));
        expect(mockedGetOAuthAuthorizeURL).toHaveBeenCalledWith("apple", "apple");
        await waitFor(() => expect(location.href).toBe("https://appleid.apple.com/auth/authorize?..."));
    });

    it("fetches the authorization URL and navigates to it when Continue with Facebook is clicked", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockResolvedValueOnce({ url: "https://www.facebook.com/v21.0/dialog/oauth?..." });
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Facebook" }));
        expect(mockedGetOAuthAuthorizeURL).toHaveBeenCalledWith("facebook", "facebook");
        await waitFor(() => expect(location.href).toBe("https://www.facebook.com/v21.0/dialog/oauth?..."));
    });

    it("shows the server's error message inline instead of navigating when the URL fetch fails", async () => {
        mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockRejectedValueOnce(new ApiRequestError("OIDC is not configured.", 500));
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Google" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("OIDC is not configured.");
        // Still on the identifier step — a failed fetch must not navigate anywhere.
        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });

    it("shows a generic message when the URL fetch fails with a non-API error", async () => {
        mockLocation();
        const user = userEvent.setup();
        mockedGetOAuthAuthorizeURL.mockRejectedValueOnce(new Error("network down"));
        render(<SignInPage />);
        await user.click(screen.getByRole("button", { name: "Continue with Microsoft" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("disables the other OAuth buttons while one provider's URL fetch is in flight", async () => {
        mockLocation();
        const user = userEvent.setup();
        let resolveFetch: (result: { url: string }) => void;
        mockedGetOAuthAuthorizeURL.mockReturnValueOnce(new Promise((resolve) => (resolveFetch = resolve)));
        render(<SignInPage />);

        await user.click(screen.getByRole("button", { name: "Continue with Google" }));
        expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Continue with Facebook" })).toBeDisabled();

        resolveFetch!({ url: "https://accounts.google.com/o/oauth2/v2/auth?..." });
        await waitFor(() => expect(window.location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?..."));
    });
});

describe("SignInPage — OAuth callback", () => {
    /**
     * Simulates the page re-mounting after the provider redirected the browser back to it with
     * `?code=...&state=<csrfToken>.<provider>` (or `?error=...&state=...`) already in the URL — the
     * `state` value a real provider would echo back is exactly what `handleOAuthSignIn` sent it,
     * combined server-side with a CSRF token (see `OIDCStrategy.buildAuthorizationURI`); the tests
     * below use a fixed `csrf` stand-in for that token, since only the portion after the first `.`
     * matters to this component. A real `Location` throws on the property reads/writes this needs
     * (`search`, `pathname`, then later `href`), so — like `mockLocation()` — this replaces it with a
     * plain writable stub, just extended with `search`/`pathname`. `history.replaceState` is stubbed
     * out too, since it's real (not part of the swapped-out `location`) and would otherwise try to
     * touch jsdom's actual navigation state.
     */
    function mockOAuthCallbackLocation(search: string): { pathname: string; search: string; href: string } {
        const location = { pathname: "/auth/signin", search, href: "" };
        Object.defineProperty(window, "location", { configurable: true, writable: true, value: location });
        vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
        return location;
    }

    it("forwards the code/state to the provider named in state and redirects to /account on success", async () => {
        mockOAuthCallbackLocation("?code=abc123&state=csrf.google");
        mockedCompleteOAuthSignIn.mockResolvedValueOnce(AUTH_RESULT);

        render(<SignInPage />);

        await waitFor(() =>
            expect(mockedCompleteOAuthSignIn).toHaveBeenCalledWith("google", "?code=abc123&state=csrf.google"),
        );
        await waitFor(() => expect(window.location.href).toBe("/account"));
        // The one-time code must not be left sitting in the URL once consumed.
        expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/auth/signin");
    });

    it("shows the server's error message and offers a way back when the exchange fails", async () => {
        mockOAuthCallbackLocation("?code=abc123&state=csrf.apple");
        mockedCompleteOAuthSignIn.mockRejectedValueOnce(new ApiRequestError("Invalid or expired code.", 401));
        const user = userEvent.setup();

        render(<SignInPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
        await user.click(screen.getByRole("button", { name: "Back to sign in" }));
        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });

    it("shows a generic message when the exchange fails with a non-API error", async () => {
        mockOAuthCallbackLocation("?code=abc123&state=csrf.facebook");
        mockedCompleteOAuthSignIn.mockRejectedValueOnce(new Error("network down"));

        render(<SignInPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("surfaces a provider-reported error (e.g. denied consent) the same way as an exchange failure", async () => {
        // Per RFC 6749 §4.1.2.1, a compliant provider echoes `state` back unchanged on an error
        // redirect too, so the provider is still recoverable here exactly as on the success path.
        mockOAuthCallbackLocation("?error=access_denied&error_description=User+denied+access&state=csrf.google");
        mockedCompleteOAuthSignIn.mockRejectedValueOnce(new ApiRequestError("OIDC provider returned an error: access_denied", 401));

        render(<SignInPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("OIDC provider returned an error: access_denied");
        expect(mockedCompleteOAuthSignIn).toHaveBeenCalledWith(
            "google",
            "?error=access_denied&error_description=User+denied+access&state=csrf.google",
        );
    });

    it("shows a fixed error without calling the API when state has no provider to recover", async () => {
        // No `.` in `state` at all — nothing for this component to have appended.
        mockOAuthCallbackLocation("?code=abc123&state=csrf");

        render(<SignInPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in could not be completed. Please try again.");
        expect(mockedCompleteOAuthSignIn).not.toHaveBeenCalled();
    });

    it("shows a fixed error without calling the API when state is missing entirely", async () => {
        mockOAuthCallbackLocation("?code=abc123");

        render(<SignInPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in could not be completed. Please try again.");
        expect(mockedCompleteOAuthSignIn).not.toHaveBeenCalled();
    });

    it("does nothing when there is no code/error in the URL", () => {
        mockOAuthCallbackLocation("");
        render(<SignInPage />);
        expect(mockedCompleteOAuthSignIn).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });
});

describe("SignInPage — unrecognized identifier redirects to sign-up", () => {
    it("redirects with type/id/autosend when the identifier looks like an e-mail address", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce(EMPTY_DISCOVER);
        render(<SignInPage />);

        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "new@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await waitFor(() =>
            expect(location.href).toBe("/auth/signup?type=email&id=new%40example.com&autosend=1"),
        );
    });

    it("redirects with type/id/autosend when the identifier looks like a phone number", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce(EMPTY_DISCOVER);
        render(<SignInPage />);

        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "+15551234567");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await waitFor(() => expect(location.href).toBe("/auth/signup?type=phone&id=%2B15551234567&autosend=1"));
    });

    it("redirects with no query params when the identifier doesn't look like an e-mail or phone", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce(EMPTY_DISCOVER);
        render(<SignInPage />);

        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "coolusername");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await waitFor(() => expect(location.href).toBe("/auth/signup"));
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
            "Hardware key",
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
        // Two available methods here (not one) — a single method skips this list entirely, covered under
        // "single available method" below.
        const user = userEvent.setup();
        await goToMethods(user, { password: true, totp: true, passkey: false, fido2: false, otp: [] });

        expect(screen.getByRole("button", { name: /^Password/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Passkey/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Email:|^Phone:/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Hardware key/ })).not.toBeInTheDocument();
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

describe("SignInPage — single available method", () => {
    it("skips the method list and goes straight to the challenge when only one fixed method is available", async () => {
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce({ ...EMPTY_DISCOVER, password: true });
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByLabelText("Password")).toBeInTheDocument();
        expect(screen.queryByText(/Choose how/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Use a different account" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Choose a different method" })).not.toBeInTheDocument();
    });

    it("skips straight to the OTP challenge when the only available method is a single discovered contact", async () => {
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce({ ...EMPTY_DISCOVER, otp: [EMAIL_HINT] });
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByText(new RegExp(escapeRegExp(EMAIL_HINT.contact)))).toBeInTheDocument();
        expect(screen.queryByText(/Choose how/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Use a different account" })).toBeInTheDocument();
    });

    it("'Use a different account' returns to the identifier step, preserving the typed value", async () => {
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce({ ...EMPTY_DISCOVER, password: true });
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await screen.findByLabelText("Password");

        await user.click(screen.getByRole("button", { name: "Use a different account" }));

        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toHaveValue("a@example.com");
    });

    it("still signs in successfully from the skipped challenge screen", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        mockedDiscoverAuthMethods.mockResolvedValueOnce({ ...EMPTY_DISCOVER, password: true });
        mockedSignInWithPassword.mockResolvedValueOnce(AUTH_RESULT);
        render(<SignInPage />);
        await user.type(screen.getByLabelText("Account ID, e-mail, or phone"), "a@example.com");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        await user.type(await screen.findByLabelText("Password"), "hunter2");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedSignInWithPassword).toHaveBeenCalledWith("a@example.com", "hunter2");
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

const TOTP_METHOD: MfaMethod = { id: "secret-totp-1", type: "totp", data: {} };
const FIDO2_METHOD: MfaMethod = { id: "secret-fido2-1", type: "fido2", data: {} };
const OTP_METHOD: MfaMethod = {
    id: "alias-otp-1",
    type: "otp",
    data: { contact: "j***n@example.com", type: "email", verified: true },
};

/**
 * Drives the password challenge to completion with a phase-1 `/auth/mfa` response of `{uid, methods}`
 * (rather than a completed `AuthResult`) — i.e. the account has a second factor to complete — landing on
 * the second-factor method-list screen.
 */
async function goToMfaChallenge(
    user: ReturnType<typeof userEvent.setup>,
    methods: MfaMethod[],
    identifier = "a@example.com",
) {
    await goToChallenge(user, "Password", ALL_METHODS, identifier);
    mockedSignInWithPassword.mockResolvedValueOnce({ uid: "u1", methods });
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(/Verify it.s you/);
}

describe("SignInPage — password method requiring a second factor (/auth/mfa)", () => {
    it("shows the account's registered second-factor methods instead of signing in directly", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD, FIDO2_METHOD]);

        expect(screen.getByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Hardware key/ })).toBeInTheDocument();
    });

    it("completes sign-in via an authenticator app second factor", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({});

        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));
        expect(mockedBeginMfaChallenge).toHaveBeenCalledWith("u1", TOTP_METHOD.id);

        mockedVerifyMfaCode.mockResolvedValueOnce(AUTH_RESULT);
        await user.type(await screen.findByLabelText("Authenticator code"), "654321");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedVerifyMfaCode).toHaveBeenCalledWith("u1", "654321");
    });

    it("completes sign-in via an OTP second factor, sending the code immediately on selection", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToMfaChallenge(user, [OTP_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({});

        await user.click(
            screen.getByRole("button", { name: new RegExp(`^Code to ${escapeRegExp(OTP_METHOD.data.contact)}`) }),
        );
        expect(mockedBeginMfaChallenge).toHaveBeenCalledWith("u1", OTP_METHOD.id);

        mockedVerifyMfaCode.mockResolvedValueOnce(AUTH_RESULT);
        await user.type(await screen.findByLabelText("One-time code"), "123456");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedVerifyMfaCode).toHaveBeenCalledWith("u1", "123456");
    });

    it("labels an OTP method generically when the server didn't include its contact", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [{ id: "alias-otp-2", type: "otp", data: {} }]);

        expect(screen.getByRole("button", { name: "One-time code" })).toBeInTheDocument();
    });

    it("completes sign-in via a hardware key second factor", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToMfaChallenge(user, [FIDO2_METHOD]);
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedBeginMfaChallenge.mockResolvedValueOnce(options);

        await user.click(screen.getByRole("button", { name: /^Hardware key/ }));
        expect(mockedBeginMfaChallenge).toHaveBeenCalledWith("u1", FIDO2_METHOD.id);

        mockedStartAuthentication.mockResolvedValueOnce(response as any);
        mockedVerifyMfaFido2.mockResolvedValueOnce(AUTH_RESULT);
        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        await waitFor(() => expect(location.href).toBe("/account"));
        expect(mockedStartAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
        expect(mockedVerifyMfaFido2).toHaveBeenCalledWith(response);
    });

    it("'Choose a different method' returns to the second-factor list without a new challenge request", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD, FIDO2_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({});
        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));
        await screen.findByLabelText("Authenticator code");

        await user.click(screen.getByRole("button", { name: "Choose a different method" }));

        expect(screen.getByRole("button", { name: /^Authenticator app/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Hardware key/ })).toBeInTheDocument();
        expect(mockedBeginMfaChallenge).toHaveBeenCalledTimes(1);
    });

    it("'Use a different account' from the second-factor list returns to the identifier step", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);

        await user.click(screen.getByRole("button", { name: "Use a different account" }));

        expect(screen.getByLabelText("Account ID, e-mail, or phone")).toBeInTheDocument();
    });

    it("shows an error message when starting the second-factor challenge fails", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);
        mockedBeginMfaChallenge.mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429));

        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests.");
    });

    it("shows a generic message when starting the second-factor challenge fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);
        mockedBeginMfaChallenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows a fixed message on an invalid second-factor code", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({});
        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));
        mockedVerifyMfaCode.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.type(await screen.findByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message when verifying the second-factor code fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [TOTP_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({});
        await user.click(screen.getByRole("button", { name: /^Authenticator app/ }));
        mockedVerifyMfaCode.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(await screen.findByLabelText("Authenticator code"), "000000");
        await user.click(screen.getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows a cancellation message when the hardware key second-factor ceremony is cancelled", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [FIDO2_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({ challenge: "c" });
        await user.click(screen.getByRole("button", { name: /^Hardware key/ }));
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key sign-in was cancelled.");
    });

    it("shows a generic message when the hardware key second-factor ceremony fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [FIDO2_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({ challenge: "c" });
        await user.click(screen.getByRole("button", { name: /^Hardware key/ }));
        mockedStartAuthentication.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("shows a fixed message when the hardware key second-factor verification fails with an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToMfaChallenge(user, [FIDO2_METHOD]);
        mockedBeginMfaChallenge.mockResolvedValueOnce({ challenge: "c" });
        await user.click(screen.getByRole("button", { name: /^Hardware key/ }));
        mockedStartAuthentication.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedVerifyMfaFido2.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(await screen.findByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key sign-in failed.");
    });
});

describe("SignInPage — fido2 method", () => {
    it("completes the ceremony and redirects to /account", async () => {
        const location = mockLocation();
        const user = userEvent.setup();
        await goToChallenge(user, "Hardware key", ALL_METHODS, "a@example.com");
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
        await goToChallenge(user, "Hardware key");
        mockedGetFido2Challenge.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartAuthentication.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key sign-in was cancelled.");
    });

    it("shows a fixed message on an ApiRequestError", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Hardware key");
        mockedGetFido2Challenge.mockRejectedValueOnce(new ApiRequestError("nope", 401));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Hardware key sign-in failed.");
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToChallenge(user, "Hardware key");
        mockedGetFido2Challenge.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Continue with security key" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });
});
