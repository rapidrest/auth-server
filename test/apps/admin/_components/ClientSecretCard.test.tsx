// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, regenerateClientSecret: vi.fn() };
});

import { ApiRequestError } from "../../../../apps/shared/lib/api.js";
import { AdminClient, regenerateClientSecret } from "../../../../apps/shared/lib/adminApi.js";
import ClientSecretCard from "../../../../apps/shared/components/admin/oauth-clients/ClientSecretCard.js";

const mockedRegenerate = vi.mocked(regenerateClientSecret);

const confidentialClient: AdminClient = {
    uid: "c1",
    version: 0,
    dateCreated: "",
    dateModified: "",
    clientId: "client-abc",
    clientType: "confidential",
    clientName: "Test App",
    redirectUris: [],
    grantTypes: [],
    responseTypes: [],
    scope: "",
    tokenEndpointAuthMethod: "client_secret_basic",
    requirePkce: false,
    firstParty: false,
};

beforeEach(() => {
    mockedRegenerate.mockReset();
});

describe("ClientSecretCard", () => {
    it("renders nothing for a public client", () => {
        const { container } = render(<ClientSecretCard client={{ ...confidentialClient, clientType: "public" }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("regenerates the secret and reveals it once", async () => {
        const user = userEvent.setup();
        mockedRegenerate.mockResolvedValue({ clientSecret: "new-plaintext-secret" });
        render(<ClientSecretCard client={confidentialClient} />);

        await user.click(screen.getByRole("button", { name: "Regenerate secret" }));

        expect(mockedRegenerate).toHaveBeenCalledWith("c1");
        expect(await screen.findByText("new-plaintext-secret")).toBeInTheDocument();
    });

    it("closes the reveal modal when Done is clicked", async () => {
        const user = userEvent.setup();
        mockedRegenerate.mockResolvedValue({ clientSecret: "new-plaintext-secret" });
        render(<ClientSecretCard client={confidentialClient} />);

        await user.click(screen.getByRole("button", { name: "Regenerate secret" }));
        await screen.findByText("new-plaintext-secret");
        await user.click(screen.getByRole("button", { name: "Done" }));

        expect(screen.queryByText("new-plaintext-secret")).not.toBeInTheDocument();
    });

    it("shows the ApiRequestError message when regeneration fails", async () => {
        const user = userEvent.setup();
        mockedRegenerate.mockRejectedValue(new ApiRequestError("not confidential", 400));
        render(<ClientSecretCard client={confidentialClient} />);
        await user.click(screen.getByRole("button", { name: "Regenerate secret" }));
        expect(await screen.findByText("not confidential")).toBeInTheDocument();
    });

    it("shows a generic message when regeneration fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedRegenerate.mockRejectedValue(new Error("network down"));
        render(<ClientSecretCard client={confidentialClient} />);
        await user.click(screen.getByRole("button", { name: "Regenerate secret" }));
        expect(await screen.findByText("Could not regenerate this client's secret.")).toBeInTheDocument();
    });
});
