// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyResponse, jsonResponse, mockFetch } from "../../testUtils.js";
import {
    createClient,
    deleteClient,
    getClient,
    listClients,
    regenerateClientSecret,
    updateClient,
} from "../../../../apps/shared/lib/adminApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

const adminClient = {
    uid: "c1",
    version: 0,
    dateCreated: "",
    dateModified: "",
    clientId: "client-abc",
    clientType: "confidential" as const,
    clientName: "Test App",
    redirectUris: ["https://example.com/callback"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    scope: "openid profile",
    tokenEndpointAuthMethod: "client_secret_basic" as const,
    requirePkce: false,
    firstParty: false,
};

describe("listClients", () => {
    it("builds the default query (limit, page)", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, [adminClient]));
        await listClients();
        expect(fetchMock).toHaveBeenCalledWith("/api/oauth/clients?limit=25&page=0", expect.anything());
    });

    it("honors an explicit page/limit", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, []));
        await listClients({ page: 2, limit: 10 });
        expect(fetchMock).toHaveBeenCalledWith("/api/oauth/clients?limit=10&page=2", expect.anything());
    });
});

describe("getClient / createClient / updateClient / deleteClient", () => {
    it("getClient fetches /oauth/clients/:uid", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, adminClient));
        await getClient("c1");
        expect(fetchMock).toHaveBeenCalledWith("/api/oauth/clients/c1", expect.anything());
    });

    it("createClient posts the full input and returns the created client", async () => {
        const created = { ...adminClient, clientSecret: "plaintext-secret" };
        const fetchMock = mockFetch(() => jsonResponse(200, created));
        const input = {
            clientName: "Test App",
            clientType: "confidential" as const,
            redirectUris: ["https://example.com/callback"],
            grantTypes: ["authorization_code"],
            responseTypes: ["code"],
            scope: "openid profile",
            tokenEndpointAuthMethod: "client_secret_basic" as const,
            firstParty: false,
        };
        const result = await createClient(input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/oauth/clients",
            expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
        );
        expect(result).toEqual(created);
    });

    it("updateClient PUTs to /oauth/clients/:uid with the input", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, adminClient));
        const input = { uid: "c1", version: 1, clientName: "Renamed" };
        await updateClient(input);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/oauth/clients/c1",
            expect.objectContaining({ method: "PUT", body: JSON.stringify(input) }),
        );
    });

    it("deleteClient sends version and omits purge by default", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteClient("c1", 3);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/oauth/clients/c1?version=3",
            expect.objectContaining({ method: "DELETE" }),
        );
    });

    it("deleteClient includes purge=true when requested", async () => {
        const fetchMock = mockFetch(() => emptyResponse(204));
        await deleteClient("c1", 3, true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/oauth/clients/c1?version=3&purge=true",
            expect.objectContaining({ method: "DELETE" }),
        );
    });
});

describe("regenerateClientSecret", () => {
    it("POSTs to the regenerate-secret action and returns the new plaintext secret", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { clientSecret: "new-secret" }));
        const result = await regenerateClientSecret("c1");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/oauth/clients/c1/regenerate-secret",
            expect.objectContaining({ method: "POST" }),
        );
        expect(result).toEqual({ clientSecret: "new-secret" });
    });
});
