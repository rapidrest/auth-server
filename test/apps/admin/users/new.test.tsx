// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../../testUtils.js";

vi.mock("../../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/api.js")>();
    return { ...actual, getCurrentUser: vi.fn(), getPasswordRequirements: vi.fn() };
});

vi.mock("../../../../apps/shared/lib/adminApi.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../apps/shared/lib/adminApi.js")>();
    return { ...actual, createUser: vi.fn(), createUserAlias: vi.fn() };
});

import { getCurrentUser, getPasswordRequirements } from "../../../../apps/shared/lib/api.js";
import { createUser, createUserAlias } from "../../../../apps/shared/lib/adminApi.js";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../../../apps/shared/lib/passwordCriteria.js";
import NewUserPage from "../../../../apps/admin/users/new/index.js";

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedGetPasswordRequirements = vi.mocked(getPasswordRequirements);
const mockedCreateUser = vi.mocked(createUser);
const mockedCreateUserAlias = vi.mocked(createUserAlias);

beforeEach(() => {
    mockedGetCurrentUser.mockReset();
    mockedGetPasswordRequirements.mockReset();
    mockedCreateUser.mockReset();
    mockedCreateUserAlias.mockReset();
    mockedGetCurrentUser.mockResolvedValue({ uid: "admin-1", roles: ["admin"], scopes: [] });
    mockedGetPasswordRequirements.mockResolvedValue(FALLBACK_PASSWORD_REQUIREMENTS);
});

describe("NewUserPage", () => {
    it("renders the create-user form once authorized", async () => {
        render(<NewUserPage userUid="admin-1" />);
        expect(await screen.findByText("New user")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    });

    it("redirects to the new account's detail page once created", async () => {
        mockedCreateUser.mockResolvedValue({
            uid: "new-1",
            roles: [],
            scopes: [],
            verified: false,
            version: 0,
            dateCreated: "",
            dateModified: "",
        });
        mockedCreateUserAlias.mockResolvedValue({
            uid: "a1",
            version: 0,
            alias: "ada@example.com",
            type: "email",
            userUid: "new-1",
            verified: false,
        });
        const location = mockLocation();
        const user = userEvent.setup();
        render(<NewUserPage userUid="admin-1" />);
        await user.type(await screen.findByLabelText("Identifier"), "ada@example.com");
        await user.click(screen.getByRole("button", { name: "Create account" }));
        expect(location.href).toBe("/admin/users/detail?uid=new-1");
    });
});
