// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../testUtils.js";
import {
    ApiRequestError,
    apiFetch,
    beginRegistration,
    clearAuthToken,
    createAlias,
    createPasswordSecret,
    createProfile,
    createTotpSecret,
    createUsernameAlias,
    deleteAlias,
    deleteSecret,
    discoverAuthMethods,
    getAuthToken,
    getFido2Challenge,
    getFido2RegistrationOptions,
    getOtpChallenge,
    getPasskeyChallenge,
    getPasskeyRegistrationOptions,
    getPasswordRequirements,
    getProfile,
    listAliases,
    listSecrets,
    logout,
    registerFido2,
    registerPasskey,
    resendContactVerificationCode,
    setAuthToken,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    updateProfile,
    updateUsernameAlias,
    verifyContact,
    verifyFido2SignIn,
    verifyPasskeySignIn,
    verifyRegistration,
} from "../../../apps/www/_lib/api.js";

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("ApiRequestError", () => {
    it("carries status and code", () => {
        const err = new ApiRequestError("nope", 403, "api-102");
        expect(err.message).toBe("nope");
        expect(err.name).toBe("ApiRequestError");
        expect(err.status).toBe(403);
        expect(err.code).toBe("api-102");
        expect(err).toBeInstanceOf(Error);
    });

    it("code is optional", () => {
        const err = new ApiRequestError("nope", 500);
        expect(err.code).toBeUndefined();
    });
});

describe("token storage", () => {
    it("getAuthToken returns null when nothing stored", () => {
        expect(getAuthToken()).toBeNull();
    });

    it("setAuthToken persists to localStorage, getAuthToken reads it back", () => {
        setAuthToken("tok-123");
        expect(getAuthToken()).toBe("tok-123");
    });

    it("clearAuthToken removes the stored token", () => {
        setAuthToken("tok-123");
        clearAuthToken();
        expect(getAuthToken()).toBeNull();
    });

    it("getAuthToken swallows a storage read failure and returns null", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
            throw new Error("boom");
        });
        expect(getAuthToken()).toBeNull();
    });

    it("setAuthToken swallows a storage write failure", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
            throw new Error("quota exceeded");
        });
        expect(() => setAuthToken("tok-123")).not.toThrow();
    });

    it("clearAuthToken swallows a storage removal failure", () => {
        vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
            throw new Error("boom");
        });
        expect(() => clearAuthToken()).not.toThrow();
    });
});

describe("logout", () => {
    it("posts to /auth/logout and clears the local token", async () => {
        setAuthToken("tok-123");
        const fetchMock = mockFetch(() => emptyResponse(200));
        await logout();
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
        expect(getAuthToken()).toBeNull();
    });

    it("still clears the local token if the network call fails", async () => {
        setAuthToken("tok-123");
        mockFetch(() => {
            throw new TypeError("network down");
        });
        await logout();
        expect(getAuthToken()).toBeNull();
    });
});

describe("apiFetch", () => {
    it("prefixes the path with /api and parses a JSON response", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { ok: true }));
        const result = await apiFetch("/status");
        expect(fetchMock).toHaveBeenCalledWith("/api/status", expect.anything());
        expect(result).toEqual({ ok: true });
    });

    it("attaches a Bearer token from storage when no Authorization header is set", async () => {
        setAuthToken("tok-abc");
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/secrets");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        expect(headers.get("Authorization")).toBe("Bearer tok-abc");
    });

    it("does not overwrite a caller-supplied Authorization header", async () => {
        setAuthToken("tok-abc");
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/auth/password", { headers: { Authorization: "Basic xyz" } });
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        expect(headers.get("Authorization")).toBe("Basic xyz");
    });

    it("sends no Authorization header when there is no stored token", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await apiFetch("/secrets/password");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        expect(headers.has("Authorization")).toBe(false);
    });

    it("returns undefined for a non-JSON response body", async () => {
        mockFetch(() => new Response("plain text", { status: 200, headers: { "content-type": "text/plain" } }));
        const result = await apiFetch("/whatever");
        expect(result).toBeUndefined();
    });

    it("treats an unparseable JSON body as no body", async () => {
        mockFetch(() => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }));
        const result = await apiFetch("/whatever");
        expect(result).toBeUndefined();
    });

    it("throws ApiRequestError using the body's message field on a non-ok response", async () => {
        mockFetch(() => jsonResponse(400, { message: "bad input", code: "api-101" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({
            name: "ApiRequestError",
            message: "bad input",
            status: 400,
            code: "api-101",
        });
    });

    it("falls back to the body's error field when message is absent", async () => {
        mockFetch(() => jsonResponse(400, { error: "bad input" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "bad input" });
    });

    it("falls back to statusText when the error response has no JSON body", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "Server Error" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "Server Error", status: 500 });
    });

    it("falls back to a generic message when there is no body and no statusText", async () => {
        mockFetch(() => new Response(null, { status: 500, statusText: "" }));
        await expect(apiFetch("/whatever")).rejects.toMatchObject({ message: "Request failed." });
    });
});

describe("registration", () => {
    it("beginRegistration sends an email identifier", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await beginRegistration("email", "a@example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/register/start",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "a@example.com" }) }),
        );
    });

    it("beginRegistration sends a phone identifier", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await beginRegistration("phone", "+15551234567");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/register/start",
            expect.objectContaining({ body: JSON.stringify({ phone: "+15551234567" }) }),
        );
    });

    it("verifyRegistration sends the identifier and code together", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        const result = await verifyRegistration("email", "a@example.com", "123456");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/register/verify",
            expect.objectContaining({ body: JSON.stringify({ email: "a@example.com", token: "123456" }) }),
        );
        expect(result).toEqual(authResult);
    });
});

describe("profile", () => {
    it("createProfile posts the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1" }));
        await createProfile({ givenName: "Ada" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/profiles",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ givenName: "Ada" }) }),
        );
    });

    it("getProfile fetches /profiles/me", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1", version: 0 }));
        await getProfile();
        expect(fetchMock).toHaveBeenCalledWith("/api/profiles/me", expect.anything());
    });

    it("updateProfile PUTs to /profiles/me with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1", version: 1 }));
        await updateProfile({ uid: "u1", version: 0, givenName: "Ada" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/profiles/me",
            expect.objectContaining({ method: "PUT", body: JSON.stringify({ uid: "u1", version: 0, givenName: "Ada" }) }),
        );
    });
});

describe("password", () => {
    it("createPasswordSecret posts a password-type secret", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "s1" }));
        await createPasswordSecret("Sup3r$ecret1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({ body: JSON.stringify({ type: "password", data: "Sup3r$ecret1" }) }),
        );
    });

    it("getPasswordRequirements fetches /secrets/password", async () => {
        const requirements = {
            min_length: 8,
            recommended_length: 32,
            require_lowercase: true,
            require_uppercase: true,
            require_numeral: true,
            require_special: true,
            special_chars: "!@#$%^&*_+?-",
        };
        const fetchMock = mockFetch(() => jsonResponse(200, requirements));
        const result = await getPasswordRequirements();
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets/password", expect.anything());
        expect(result).toEqual(requirements);
    });

    it("signInWithPassword sends Basic auth built from id:password, UTF-8 safe", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        await signInWithPassword("a@example.com", "pässwörd");
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const headers = init.headers as Headers;
        const authHeader = headers.get("Authorization") as string;
        expect(authHeader.startsWith("Basic ")).toBe(true);
        const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf-8");
        expect(decoded).toBe("a@example.com:pässwörd");
    });
});

describe("totp sign-in", () => {
    it("signInWithTotp posts the id and token", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        await signInWithTotp("u1", "654321");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/totp",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "u1", token: "654321" }) }),
        );
    });
});

describe("passkey sign-in", () => {
    it("getPasskeyChallenge omits the query string with no uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getPasskeyChallenge();
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/passkey", expect.anything());
    });

    it("getPasskeyChallenge appends an encoded uid query param", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getPasskeyChallenge("a b@example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/passkey?uid=a%20b%40example.com", expect.anything());
    });

    it("verifyPasskeySignIn posts the assertion response", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        const response = { id: "cred1" };
        await verifyPasskeySignIn(response);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/passkey",
            expect.objectContaining({ method: "POST", body: JSON.stringify(response) }),
        );
    });
});

describe("fido2 sign-in", () => {
    it("getFido2Challenge omits the query string with no uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getFido2Challenge();
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/fido2", expect.anything());
    });

    it("getFido2Challenge appends an encoded uid query param", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getFido2Challenge("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/fido2?uid=u1", expect.anything());
    });

    it("verifyFido2SignIn posts the assertion response", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        const response = { id: "cred1" };
        await verifyFido2SignIn(response);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/fido2",
            expect.objectContaining({ method: "POST", body: JSON.stringify(response) }),
        );
    });
});

describe("aliases", () => {
    it("listAliases fetches /aliases", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAliases();
        expect(fetchMock).toHaveBeenCalledWith("/api/aliases", expect.anything());
    });

    it("createAlias posts type/alias/verified:false", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "a1" }));
        await createAlias("phone", "+15551234567");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/aliases",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "phone", alias: "+15551234567", verified: false }),
            }),
        );
    });

    it("deleteAlias DELETEs the encoded uid", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteAlias("a/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/aliases/a%2F1", expect.objectContaining({ method: "DELETE" }));
    });

    it("createAlias posts verified:true when explicitly passed", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "a1" }));
        await createAlias("phone", "+15551234567", true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/aliases",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "phone", alias: "+15551234567", verified: true }),
            }),
        );
    });

    it("createUsernameAlias posts a verified name-type alias", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "a1" }));
        await createUsernameAlias("coolname");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/aliases",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "name", alias: "coolname", verified: true }),
            }),
        );
    });

    it("updateUsernameAlias deletes the old alias then creates the new one", async () => {
        const fetchMock = mockFetch((url) =>
            url.startsWith("/api/aliases/old-uid") ? emptyResponse(200) : jsonResponse(200, { uid: "a2" }),
        );
        const result = await updateUsernameAlias("old-uid", "newname");
        expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/aliases/old-uid", expect.objectContaining({ method: "DELETE" }));
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/aliases",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "name", alias: "newname", verified: true }),
            }),
        );
        expect(result).toEqual({ uid: "a2" });
    });
});

describe("auth discovery", () => {
    it("discoverAuthMethods fetches /auth/discover with an encoded id", async () => {
        const result = {
            password: true,
            totp: false,
            passkey: false,
            fido2: false,
            otp: [{ contact: "j***n@example.com", type: "email" as const }],
        };
        const fetchMock = mockFetch(() => jsonResponse(200, result));
        const returned = await discoverAuthMethods("a b@example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/discover?id=a%20b%40example.com", expect.anything());
        expect(returned).toEqual(result);
    });
});

describe("otp sign-in", () => {
    it("getOtpChallenge posts only the id (no token)", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getOtpChallenge("+15551234567");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/otp",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "+15551234567" }) }),
        );
    });

    it("signInWithOtp posts the id and token", async () => {
        const authResult = { token: "tok", user: { uid: "u1", roles: [], scopes: [] } };
        const fetchMock = mockFetch(() => jsonResponse(200, authResult));
        await signInWithOtp("+15551234567", "654321");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/otp",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "+15551234567", token: "654321" }) }),
        );
    });
});

describe("contact verification", () => {
    it("verifyContact posts the contact and token", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1", version: 1 }));
        await verifyContact("+15551234567", "654321");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/profiles/me/contacts/verify",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ contact: "+15551234567", token: "654321" }) }),
        );
    });

    it("resendContactVerificationCode GETs the sendCode endpoint with an encoded contact query param", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await resendContactVerificationCode("a b@example.com");
        expect(fetchMock).toHaveBeenCalledWith("/api/profiles/me/contacts/sendCode?contact=a%20b%40example.com", expect.anything());
    });
});

describe("secrets", () => {
    it("listSecrets fetches /secrets", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listSecrets();
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets", expect.anything());
    });

    it("deleteSecret DELETEs the encoded uid", async () => {
        const fetchMock = mockFetch(() => emptyResponse(200));
        await deleteSecret("s/1");
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets/s%2F1", expect.objectContaining({ method: "DELETE" }));
    });

    it("createTotpSecret posts a totp-type secret with no data", async () => {
        const created = {
            uid: "s1",
            version: 0,
            type: "totp",
            userUid: "u1",
            dateCreated: "2026-01-01T00:00:00.000Z",
            data: { secret: "ABC", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        };
        const fetchMock = mockFetch(() => jsonResponse(200, created));
        const result = await createTotpSecret();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({ body: JSON.stringify({ type: "totp" }) }),
        );
        expect(result).toEqual(created);
    });

    it("getPasskeyRegistrationOptions fetches /secrets/passkey/register", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getPasskeyRegistrationOptions();
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets/passkey/register", expect.anything());
    });

    it("registerPasskey posts a passkey-type secret with the response as data", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "cred1" }));
        const response = { id: "cred1" };
        await registerPasskey(response);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({ body: JSON.stringify({ type: "passkey", data: response }) }),
        );
    });

    it("getFido2RegistrationOptions fetches /secrets/fido2/register", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await getFido2RegistrationOptions();
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets/fido2/register", expect.anything());
    });

    it("registerFido2 posts a fido2-type secret with the response as data", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "cred1" }));
        const response = { id: "cred1" };
        await registerFido2(response);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({ body: JSON.stringify({ type: "fido2", data: response }) }),
        );
    });
});
