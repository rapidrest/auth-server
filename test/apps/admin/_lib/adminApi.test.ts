// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../../testUtils.js";
import { setAuthToken } from "../../../../apps/shared/lib/api.js";
import {
    createUser,
    createUserAlias,
    createUserPasswordSecret,
    deleteUser,
    getUser,
    getUserProfile,
    listAliasesForUsers,
    listUserAliases,
    listUsers,
    listUserSecrets,
    searchUsers,
    updateUser,
    upsertUserProfile,
} from "../../../../apps/shared/lib/adminApi.js";

beforeEach(() => {
    window.localStorage.clear();
    setAuthToken("tok");
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const adminUser = { uid: "u1", roles: ["admin"], scopes: [], verified: true, version: 0, dateCreated: "", dateModified: "" };

describe("listUsers", () => {
    it("builds the default query (limit, page, sort)", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [adminUser]));
        await listUsers();
        expect(fetchMock).toHaveBeenCalledWith("/api/users?limit=25&page=0&sort=dateCreated", expect.anything());
    });

    it("includes role, verified, and uid filters when provided", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listUsers({ page: 2, limit: 10, sort: "uid", role: "admin", verified: true, uid: "abc" });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain("limit=10");
        expect(url).toContain("page=2");
        expect(url).toContain("sort=uid");
        expect(url).toContain(`roles=${encodeURIComponent("in(admin)")}`);
        expect(url).toContain(`verified=${encodeURIComponent("eq(true)")}`);
        expect(url).toContain(`uid=${encodeURIComponent("like(abc)")}`);
    });

    it("encodes a false verified filter (distinguishing it from 'unset')", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listUsers({ verified: false });
        expect(fetchMock.mock.calls[0][0]).toContain(`verified=${encodeURIComponent("eq(false)")}`);
    });
});

describe("getUser / createUser / updateUser / deleteUser", () => {
    it("getUser fetches /users/:id", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, adminUser));
        await getUser("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/users/u1", expect.anything());
    });

    it("createUser posts roles/scopes/verified", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, adminUser));
        await createUser({ roles: ["admin"], scopes: [], verified: true });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/users",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ roles: ["admin"], scopes: [], verified: true }),
            }),
        );
    });

    it("updateUser PUTs to /users/:uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, adminUser));
        const input = { uid: "u1", version: 1, roles: ["admin"] };
        await updateUser(input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/users/u1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
        );
    });

    it("deleteUser sends version and omits purge by default", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteUser("u1", 3);
        expect(fetchMock).toHaveBeenCalledWith("/api/users/u1?version=3", expect.objectContaining({ method: "DELETE" }));
    });

    it("deleteUser includes purge=true when requested", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteUser("u1", 3, true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/users/u1?version=3&purge=true",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});

describe("searchUsers", () => {
    it("delegates to listUsers when the query is blank", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [adminUser]));
        const result = await searchUsers("   ");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain("/api/users?");
        expect(result).toEqual([adminUser]);
    });

    it("merges uid substring matches with alias-resolved accounts, deduplicating by uid", async () => {
        const other = { ...adminUser, uid: "u2" };
        const fetchMock = mockFetch((url) => {
            if (url.startsWith("/api/users?")) {
                return jsonResponse(200, [adminUser]);
            }
            if (url.startsWith("/api/aliases?")) {
                return jsonResponse(200, [
                    { uid: "a1", version: 0, alias: "ada@example.com", type: "email", userUid: "u1", verified: true },
                    { uid: "a2", version: 0, alias: "ada2@example.com", type: "email", userUid: "u2", verified: true },
                ]);
            }
            if (url === "/api/users/u1") {
                return jsonResponse(200, adminUser);
            }
            if (url === "/api/users/u2") {
                return jsonResponse(200, other);
            }
            throw new Error(`unexpected url ${url}`);
        });
        const result = await searchUsers("ada");
        expect(fetchMock).toHaveBeenCalled();
        expect(result.map((u) => u.uid).sort()).toEqual(["u1", "u2"]);
    });

    it("silently drops an alias whose account 404s (deleted between the two lookups)", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/users?")) {
                return jsonResponse(200, []);
            }
            if (url.startsWith("/api/aliases?")) {
                return jsonResponse(200, [
                    { uid: "a1", version: 0, alias: "gone@example.com", type: "email", userUid: "u9", verified: true },
                ]);
            }
            if (url === "/api/users/u9") {
                return jsonResponse(404, { message: "not found" });
            }
            throw new Error(`unexpected url ${url}`);
        });
        const result = await searchUsers("gone");
        expect(result).toEqual([]);
    });

    it("propagates a non-404 error while resolving an alias's account", async () => {
        mockFetch((url) => {
            if (url.startsWith("/api/users?")) {
                return jsonResponse(200, []);
            }
            if (url.startsWith("/api/aliases?")) {
                return jsonResponse(200, [
                    { uid: "a1", version: 0, alias: "x@example.com", type: "email", userUid: "u9", verified: true },
                ]);
            }
            if (url === "/api/users/u9") {
                return jsonResponse(500, { message: "boom" });
            }
            throw new Error(`unexpected url ${url}`);
        });
        await expect(searchUsers("x")).rejects.toThrow("boom");
    });
});

describe("aliases", () => {
    it("listUserAliases filters by userUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listUserAliases("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/aliases?userUid=u1", expect.anything());
    });

    it("listAliasesForUsers filters by an in() list of userUids", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listAliasesForUsers(["u1", "u2"]);
        expect(fetchMock).toHaveBeenCalledWith(
            `/api/aliases?userUid=${encodeURIComponent("in(u1,u2)")}&limit=1000`,
            expect.anything(),
        );
    });

    it("listAliasesForUsers skips the request entirely for an empty list", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        const result = await listAliasesForUsers([]);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result).toEqual([]);
    });

    it("createUserAlias posts type/alias/userUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await createUserAlias("u1", "email", "ada@example.com");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/aliases",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "email", alias: "ada@example.com", userUid: "u1" }),
            }),
        );
    });
});

describe("secrets", () => {
    it("listUserSecrets filters by userUid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listUserSecrets("u1");
        expect(fetchMock).toHaveBeenCalledWith("/api/secrets?userUid=u1", expect.anything());
    });

    it("createUserPasswordSecret posts the password with a hint", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await createUserPasswordSecret("u1", "S3cret!!!", "Set by administrator");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ type: "password", data: "S3cret!!!", userUid: "u1", hint: "Set by administrator" }),
            }),
        );
    });

    it("createUserPasswordSecret omits hint when not given", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, {}));
        await createUserPasswordSecret("u1", "S3cret!!!");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/secrets",
            expect.objectContaining({ body: JSON.stringify({ type: "password", data: "S3cret!!!", userUid: "u1" }) }),
        );
    });
});

describe("profile", () => {
    it("getUserProfile returns the profile on success", async () => {
        const profile = { uid: "u1", version: 0 };
        mockFetch(() => jsonResponse(200, profile));
        await expect(getUserProfile("u1")).resolves.toEqual(profile);
    });

    it("getUserProfile returns null on 404", async () => {
        mockFetch(() => jsonResponse(404, { message: "not found" }));
        await expect(getUserProfile("u1")).resolves.toBeNull();
    });

    it("getUserProfile rethrows non-404 errors", async () => {
        mockFetch(() => jsonResponse(500, { message: "boom" }));
        await expect(getUserProfile("u1")).rejects.toThrow("boom");
    });

    it("upsertUserProfile POSTs when there is no existing profile", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1" }));
        await upsertUserProfile("u1", { givenName: "Ada" }, null);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/profiles",
            expect.objectContaining({ method: "POST", body: JSON.stringify({ uid: "u1", givenName: "Ada" }) }),
        );
    });

    it("upsertUserProfile PUTs with the existing version when a profile already exists", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { uid: "u1", version: 2 }));
        await upsertUserProfile("u1", { givenName: "Ada" }, { uid: "u1", version: 2 });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/profiles/u1",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ uid: "u1", version: 2, givenName: "Ada" }),
            }),
        );
    });
});
