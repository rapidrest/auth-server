// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import { ApiRequestError, requestAuthorization, submitConsent } from "../../../apps/shared/lib/api.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("requestAuthorization", () => {
    it("fetches the bare /oauth/authorize path (not under /api), forwarding every provided param", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { redirectTo: "https://example.com/callback" }));
        await requestAuthorization({
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
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url.startsWith("/oauth/authorize?")).toBe(true);
        expect(url).not.toContain("/api/");
        expect(url).toContain("response_type=code");
        expect(url).toContain("client_id=abc");
        expect(url).toContain(`redirect_uri=${encodeURIComponent("https://example.com/callback")}`);
        // URLSearchParams encodes a space as "+", not "%20".
        expect(url).toContain("scope=openid+profile");
        expect(url).toContain("state=xyz");
        expect(url).toContain("code_challenge=challenge");
        expect(url).toContain("code_challenge_method=S256");
        expect(url).toContain("nonce=n-1");
        expect(url).toContain("prompt=consent");
    });

    it("omits params that are absent, rather than sending them empty", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { redirectTo: "https://example.com/callback" }));
        await requestAuthorization({ client_id: "abc" });
        expect(fetchMock.mock.calls[0][0]).toBe("/oauth/authorize?client_id=abc");
    });

    it("omits a param that's present but falsy (e.g. an empty string)", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { redirectTo: "https://example.com/callback" }));
        await requestAuthorization({ client_id: "abc", scope: "" });
        expect(fetchMock.mock.calls[0][0]).toBe("/oauth/authorize?client_id=abc");
    });

    it("treats an unparseable JSON body as no body", async () => {
        mockFetch(() => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
        const result = await requestAuthorization({ client_id: "abc" });
        expect(result).toBeUndefined();
    });

    it("returns the parsed JSON body on success", async () => {
        const body = { consentRequired: true as const, requestId: "req-1", client: { clientName: "App", scope: "openid" } };
        mockFetch(() => jsonResponse(200, body));
        await expect(requestAuthorization({ client_id: "abc" })).resolves.toEqual(body);
    });

    it("throws an ApiRequestError decoded from the JSON error body", async () => {
        mockFetch(() => jsonResponse(400, { code: "api-1", message: "Unknown or disabled client_id." }));
        await expect(requestAuthorization({ client_id: "bad" })).rejects.toMatchObject({
            message: "Unknown or disabled client_id.",
            status: 400,
            code: "api-1",
        });
    });

    it("falls back to statusText when the error response has no JSON body", async () => {
        mockFetch(() => emptyResponse(500, { statusText: "Internal Server Error" }));
        await expect(requestAuthorization({ client_id: "abc" })).rejects.toThrow("Internal Server Error");
    });

    it("falls back to the JSON body's error field when message is absent", async () => {
        mockFetch(() => jsonResponse(400, { error: "invalid_request" }));
        await expect(requestAuthorization({ client_id: "abc" })).rejects.toThrow("invalid_request");
    });

    it("falls back to a fixed message when neither the body nor statusText has anything useful", async () => {
        mockFetch(() => jsonResponse(400, {}, { statusText: "" }));
        await expect(requestAuthorization({ client_id: "abc" })).rejects.toThrow("Request failed.");
    });
});

describe("submitConsent", () => {
    it("POSTs {requestId, approved} to the bare /oauth/authorize/consent path", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { redirectTo: "https://example.com/callback?code=xyz" }));
        const result = await submitConsent("req-1", true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/oauth/authorize/consent",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ requestId: "req-1", approved: true }) }),
        );
        expect(result).toEqual({ redirectTo: "https://example.com/callback?code=xyz" });
    });

    it("throws an ApiRequestError decoded from the JSON error body", async () => {
        mockFetch(() => jsonResponse(403, { code: "api-3", message: "This consent request does not belong to the current user." }));
        await expect(submitConsent("req-1", true)).rejects.toBeInstanceOf(ApiRequestError);
    });
});
