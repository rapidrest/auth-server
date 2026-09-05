// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, requestAuthorization: vi.fn(), submitConsent: vi.fn() };
});

import { ApiRequestError, requestAuthorization, submitConsent } from "../../../apps/shared/lib/api.js";
import AuthorizePage, { fetchProps } from "../../../apps/www/auth/authorize/index.js";

const mockedRequestAuthorization = vi.mocked(requestAuthorization);
const mockedSubmitConsent = vi.mocked(submitConsent);

/** Stubs `window.location` with a writable `href`/`replace`/`pathname`/`search`, like the OAuth-callback stub in signin.test.tsx. */
function stubLocation(pathname: string, search: string): { href: string; replace: ReturnType<typeof vi.fn>; pathname: string; search: string } {
    const location = { href: "", replace: vi.fn(), pathname, search };
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: location });
    return location;
}

const consentOutcome = {
    consentRequired: true as const,
    requestId: "req-1",
    client: { clientName: "Example App", scope: "openid profile custom:scope" },
};

beforeEach(() => {
    mockedRequestAuthorization.mockReset();
    mockedSubmitConsent.mockReset();
});

describe("AuthorizePage — fetchProps", () => {
    it("passes through every recognized OAuth query parameter", async () => {
        const props = await fetchProps({
            query: {
                response_type: "code",
                client_id: "abc",
                redirect_uri: "https://example.com/callback",
                scope: "openid profile",
                state: "xyz",
                code_challenge: "challenge",
                code_challenge_method: "S256",
                nonce: "n-1",
                prompt: "consent",
            },
        });
        expect(props).toEqual({
            response_type: "code",
            client_id: "abc",
            redirect_uri: "https://example.com/callback",
            scope: "openid profile",
            state: "xyz",
            code_challenge: "challenge",
            code_challenge_method: "S256",
            nonce: "n-1",
            prompt: "consent",
        });
    });

    it("omits keys entirely absent from the query, rather than setting them to undefined", async () => {
        const props = await fetchProps({ query: { client_id: "abc" } });
        expect(props).toEqual({ client_id: "abc" });
    });

    it("ignores a non-string value (e.g. a repeated query param parsed as an array)", async () => {
        const props = await fetchProps({ query: { client_id: ["a", "b"] } });
        expect(props).toEqual({});
    });

    it("defaults to an empty object with no query at all", async () => {
        expect(await fetchProps({})).toEqual({});
    });
});

describe("AuthorizePage — no session", () => {
    it("redirects to sign-in with a returnTo hand-off when there is no userUid", async () => {
        const location = stubLocation("/auth/authorize", "?client_id=abc");
        render(<AuthorizePage client_id="abc" />);
        await waitFor(() =>
            expect(location.replace).toHaveBeenCalledWith(`/auth/signin?returnTo=${encodeURIComponent("/auth/authorize?client_id=abc")}`),
        );
        expect(mockedRequestAuthorization).not.toHaveBeenCalled();
    });
});

describe("AuthorizePage — with a session", () => {
    it("navigates immediately on a {redirectTo} outcome", async () => {
        stubLocation("/auth/authorize", "?client_id=abc");
        mockedRequestAuthorization.mockResolvedValue({ redirectTo: "https://example.com/callback?code=xyz" });
        render(<AuthorizePage userUid="u1" client_id="abc" />);
        await waitFor(() => expect(window.location.href).toBe("https://example.com/callback?code=xyz"));
    });

    it("redirects to sign-in on a defensive {loginRequired} outcome", async () => {
        const location = stubLocation("/auth/authorize", "?client_id=abc");
        mockedRequestAuthorization.mockResolvedValue({ loginRequired: true });
        render(<AuthorizePage userUid="u1" client_id="abc" />);
        await waitFor(() =>
            expect(location.replace).toHaveBeenCalledWith(`/auth/signin?returnTo=${encodeURIComponent("/auth/authorize?client_id=abc")}`),
        );
    });

    it("shows the ApiRequestError message when the authorization request fails", async () => {
        stubLocation("/auth/authorize", "?client_id=abc");
        mockedRequestAuthorization.mockRejectedValue(new ApiRequestError("Unknown or disabled client_id.", 400));
        render(<AuthorizePage userUid="u1" client_id="abc" />);
        expect(await screen.findByText("Unknown or disabled client_id.")).toBeInTheDocument();
    });

    it("shows a generic message for a non-API failure", async () => {
        stubLocation("/auth/authorize", "?client_id=abc");
        mockedRequestAuthorization.mockRejectedValue(new Error("network down"));
        render(<AuthorizePage userUid="u1" client_id="abc" />);
        expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });

    describe("consent required", () => {
        beforeEach(() => {
            stubLocation("/auth/authorize", "?client_id=abc");
            mockedRequestAuthorization.mockResolvedValue(consentOutcome);
        });

        it("renders the client name and human-readable scope descriptions, falling back to the raw name for an unknown scope", async () => {
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            expect(await screen.findByText("Example App wants to access your account")).toBeInTheDocument();
            expect(screen.getByText("Confirm your identity")).toBeInTheDocument();
            expect(screen.getByText("Your basic profile information")).toBeInTheDocument();
            expect(screen.getByText("custom:scope")).toBeInTheDocument();
        });

        it("describes email, phone, and offline_access scopes", async () => {
            mockedRequestAuthorization.mockResolvedValue({
                ...consentOutcome,
                client: { ...consentOutcome.client, scope: "email phone offline_access" },
            });
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            expect(await screen.findByText("Your email address")).toBeInTheDocument();
            expect(screen.getByText("Your phone number")).toBeInTheDocument();
            expect(screen.getByText("Access your account while you're away")).toBeInTheDocument();
        });

        it("renders the client's logo when provided", async () => {
            mockedRequestAuthorization.mockResolvedValue({
                ...consentOutcome,
                client: { ...consentOutcome.client, logoUri: "https://example.com/logo.png" },
            });
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            expect(await screen.findByRole("img", { name: "Example App logo" })).toHaveAttribute(
                "src",
                "https://example.com/logo.png",
            );
        });

        it("approves and navigates to the resulting redirectTo", async () => {
            const user = userEvent.setup();
            mockedSubmitConsent.mockResolvedValue({ redirectTo: "https://example.com/callback?code=xyz" });
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            await user.click(await screen.findByRole("button", { name: "Approve" }));
            expect(mockedSubmitConsent).toHaveBeenCalledWith("req-1", true);
            await waitFor(() => expect(window.location.href).toBe("https://example.com/callback?code=xyz"));
        });

        it("denies and navigates to the resulting redirectTo", async () => {
            const user = userEvent.setup();
            mockedSubmitConsent.mockResolvedValue({ redirectTo: "https://example.com/callback?error=access_denied" });
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            await user.click(await screen.findByRole("button", { name: "Deny" }));
            expect(mockedSubmitConsent).toHaveBeenCalledWith("req-1", false);
            await waitFor(() => expect(window.location.href).toBe("https://example.com/callback?error=access_denied"));
        });

        it("shows the ApiRequestError message when submitting the decision fails", async () => {
            const user = userEvent.setup();
            mockedSubmitConsent.mockRejectedValue(new ApiRequestError("requestId is invalid or has expired.", 400));
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            await user.click(await screen.findByRole("button", { name: "Approve" }));
            expect(await screen.findByText("requestId is invalid or has expired.")).toBeInTheDocument();
        });

        it("shows a generic message when submitting the decision fails with a non-API error", async () => {
            const user = userEvent.setup();
            mockedSubmitConsent.mockRejectedValue(new Error("network down"));
            render(<AuthorizePage userUid="u1" client_id="abc" />);
            await user.click(await screen.findByRole("button", { name: "Approve" }));
            expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
        });
    });
});
