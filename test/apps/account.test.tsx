// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "./testUtils.js";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../apps/www/lib/passwordCriteria.js";

vi.mock("@simplewebauthn/browser", () => ({
    startRegistration: vi.fn(),
}));

vi.mock("qrcode", () => ({
    default: { toDataURL: vi.fn() },
}));

vi.mock("../../apps/www/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../apps/www/lib/api.js")>();
    return {
        ...actual,
        logout: vi.fn(),
        createAlias: vi.fn(),
        createPasswordSecret: vi.fn(),
        createProfile: vi.fn(),
        createTotpSecret: vi.fn(),
        createUsernameAlias: vi.fn(),
        deleteAlias: vi.fn(),
        deleteSecret: vi.fn(),
        getFido2RegistrationOptions: vi.fn(),
        getPasskeyRegistrationOptions: vi.fn(),
        getPasswordRequirements: vi.fn(),
        getProfile: vi.fn(),
        listAliases: vi.fn(),
        listSecrets: vi.fn(),
        registerFido2: vi.fn(),
        registerPasskey: vi.fn(),
        resendContactVerificationCode: vi.fn(),
        updateProfile: vi.fn(),
        updateUsernameAlias: vi.fn(),
        verifyContact: vi.fn(),
    };
});

import { startRegistration } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import {
    ApiRequestError,
    Alias,
    Contact,
    Profile,
    SecretSummary,
    createAlias,
    createPasswordSecret,
    createProfile,
    createTotpSecret,
    createUsernameAlias,
    deleteAlias,
    deleteSecret,
    getFido2RegistrationOptions,
    getPasskeyRegistrationOptions,
    getPasswordRequirements,
    getProfile,
    listAliases,
    listSecrets,
    logout,
    registerFido2,
    registerPasskey,
    resendContactVerificationCode,
    updateProfile,
    updateUsernameAlias,
    verifyContact,
} from "../../apps/www/lib/api.js";
import AccountPage from "../../apps/www/account/index.js";

const mockedStartRegistration = vi.mocked(startRegistration);
const mockedToDataURL = vi.mocked(QRCode.toDataURL);
const mockedLogout = vi.mocked(logout);
const mockedCreateAlias = vi.mocked(createAlias);
const mockedCreatePasswordSecret = vi.mocked(createPasswordSecret);
const mockedCreateProfile = vi.mocked(createProfile);
const mockedCreateTotpSecret = vi.mocked(createTotpSecret);
const mockedCreateUsernameAlias = vi.mocked(createUsernameAlias);
const mockedDeleteAlias = vi.mocked(deleteAlias);
const mockedDeleteSecret = vi.mocked(deleteSecret);
const mockedGetFido2RegistrationOptions = vi.mocked(getFido2RegistrationOptions);
const mockedGetPasskeyRegistrationOptions = vi.mocked(getPasskeyRegistrationOptions);
const mockedGetPasswordRequirements = vi.mocked(getPasswordRequirements);
const mockedGetProfile = vi.mocked(getProfile);
const mockedListAliases = vi.mocked(listAliases);
const mockedListSecrets = vi.mocked(listSecrets);
const mockedRegisterFido2 = vi.mocked(registerFido2);
const mockedRegisterPasskey = vi.mocked(registerPasskey);
const mockedUpdateProfile = vi.mocked(updateProfile);
const mockedUpdateUsernameAlias = vi.mocked(updateUsernameAlias);
const mockedVerifyContact = vi.mocked(verifyContact);
const mockedResendContactVerificationCode = vi.mocked(resendContactVerificationCode);

function alias(overrides: Partial<Alias> = {}): Alias {
    return {
        uid: "a1",
        version: 0,
        alias: "a@example.com",
        type: "email",
        userUid: "u1",
        verified: true,
        ...overrides,
    };
}

function secret(overrides: Partial<SecretSummary> = {}): SecretSummary {
    return {
        uid: "s1",
        version: 0,
        type: "password",
        userUid: "u1",
        dateCreated: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function contact(overrides: Partial<Contact> = {}): Contact {
    return { contact: "ada@example.com", type: "email", verified: true, ...overrides };
}

function profileObj(overrides: Partial<Profile> = {}): Profile {
    return { uid: "u1", version: 0, contacts: [], ...overrides };
}

// The Contacts and Sign-in methods cards each have their own "+ Add" button — scope queries to the right
// card's container to disambiguate. Both card titles are static markup, present immediately after render.
function contactsCard(): HTMLElement {
    return screen.getByText("Contacts").closest(".rr-card") as HTMLElement;
}
function secretsCard(): HTMLElement {
    return screen.getByText("Sign-in methods").closest(".rr-card") as HTMLElement;
}

beforeEach(() => {
    mockedGetProfile.mockRejectedValue(new ApiRequestError("not found", 404));
    mockedListAliases.mockResolvedValue([alias()]);
    mockedListSecrets.mockResolvedValue([]);
    mockedGetPasswordRequirements.mockResolvedValue(FALLBACK_PASSWORD_REQUIREMENTS);
    window.confirm = vi.fn(() => true);
});

describe("AccountPage — auth guard", () => {
    it("redirects to /auth/signin and renders nothing when there is no userUid", () => {
        const location = mockLocation();
        const { container } = render(<AccountPage />);
        expect(location.replace).toHaveBeenCalledWith("/auth/signin");
        expect(container.querySelector(".rr-card")).toBeNull();
    });
});

describe("AccountPage — profile loading", () => {
    it("shows 'there' and no email when no profile exists yet (404)", async () => {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        expect(screen.getByText("Welcome, there")).toBeInTheDocument();
    });

    it("populates the form and header from an existing profile", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(
            profileObj({
                version: 2,
                givenName: "Ada",
                familyName: "Lovelace",
                birthdate: "1990-01-01T08:00:00.000Z",
                contacts: [contact()],
            }),
        );
        render(<AccountPage userUid="u1" />);

        expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument();
        expect(screen.getAllByText("ada@example.com").length).toBeGreaterThan(0);
        expect(screen.getByLabelText("Given name")).toHaveValue("Ada");
        expect(screen.getByLabelText("Family name")).toHaveValue("Lovelace");
        expect(screen.getByLabelText("Birthdate")).toHaveValue("1990-01-01");
    });

    it("falls back to the e-mail contact and its initial when there is no name", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact()] }));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("Welcome, ada@example.com")).toBeInTheDocument();
        expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("shows an error message for a non-404 profile load failure (ApiRequestError)", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockRejectedValueOnce(new ApiRequestError("server exploded", 500));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("server exploded")).toBeInTheDocument();
    });

    it("shows a generic error message for a non-API profile load failure", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockRejectedValueOnce(new TypeError("boom"));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("Could not load your profile.")).toBeInTheDocument();
    });
});

describe("AccountPage — profile saving", () => {
    it("creates a profile (POST) the first time, when none existed", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        mockedCreateProfile.mockResolvedValueOnce(profileObj({ givenName: "Ada" }));

        await user.type(screen.getByLabelText("Given name"), "Ada");
        await user.type(screen.getByLabelText("Family name"), "Lovelace");
        await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
        await user.click(screen.getByRole("button", { name: "Save profile" }));

        await screen.findByText("Saved.");
        expect(mockedCreateProfile).toHaveBeenCalledWith({ givenName: "Ada", familyName: "Lovelace", birthdate: "1990-01-01" });
    });

    it("updates the profile (PUT) with uid/version when one already exists", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ version: 3, givenName: "Ada" }));
        render(<AccountPage userUid="u1" />);
        await screen.findByDisplayValue("Ada");
        mockedUpdateProfile.mockResolvedValueOnce(profileObj({ version: 4, givenName: "Ada B." }));

        await user.clear(screen.getByLabelText("Given name"));
        await user.type(screen.getByLabelText("Given name"), "Ada B.");
        await user.click(screen.getByRole("button", { name: "Save profile" }));

        await screen.findByText("Saved.");
        expect(mockedUpdateProfile).toHaveBeenCalledWith({
            uid: "u1",
            version: 3,
            givenName: "Ada B.",
            familyName: undefined,
            birthdate: undefined,
        });
    });

    it("clears the 'Saved.' indicator again once a field changes", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        mockedCreateProfile.mockResolvedValueOnce(profileObj());

        await user.click(screen.getByRole("button", { name: "Save profile" }));
        await screen.findByText("Saved.");

        await user.type(screen.getByLabelText("Family name"), "L");
        expect(screen.queryByText("Saved.")).toBeNull();
    });

    it("shows the ApiRequestError message when saving fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        mockedCreateProfile.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when saving fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        mockedCreateProfile.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Save profile" }));
        expect(await screen.findByText("Could not save your profile.")).toBeInTheDocument();
    });
});

describe("AccountPage — username", () => {
    it("shows an inline add form when there is no username alias", async () => {
        render(<AccountPage userUid="u1" />);
        await screen.findByPlaceholderText("username");
    });

    it("adds a username via the inline form", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByPlaceholderText("username");
        mockedCreateUsernameAlias.mockResolvedValueOnce(alias({ uid: "n1", type: "name", alias: "coolname", verified: true }));

        await user.type(screen.getByPlaceholderText("username"), "coolname");
        await user.click(within(screen.getByPlaceholderText("username").closest("form")!).getByRole("button", { name: "Add" }));

        expect(mockedCreateUsernameAlias).toHaveBeenCalledWith("coolname");
        expect(await screen.findByText("coolname")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when adding a username fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByPlaceholderText("username");
        mockedCreateUsernameAlias.mockRejectedValueOnce(new ApiRequestError("taken", 409));

        await user.type(screen.getByPlaceholderText("username"), "coolname");
        await user.click(within(screen.getByPlaceholderText("username").closest("form")!).getByRole("button", { name: "Add" }));

        expect(await screen.findByText("taken")).toBeInTheDocument();
    });

    it("shows a generic message when adding a username fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByPlaceholderText("username");
        mockedCreateUsernameAlias.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByPlaceholderText("username"), "coolname");
        await user.click(within(screen.getByPlaceholderText("username").closest("form")!).getByRole("button", { name: "Add" }));

        expect(await screen.findByText("Could not save that username.")).toBeInTheDocument();
    });

    it("shows the existing username read-only with a Change button", async () => {
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "n1", type: "name", alias: "coolname", verified: true })]);
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("coolname")).toBeInTheDocument();
        expect(screen.queryByPlaceholderText("username")).toBeNull();
    });

    it("changes the username via the modal, replacing the old alias with the new one", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "n1", type: "name", alias: "oldname", verified: true })]);
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Change" }));

        const input = screen.getByLabelText("Username");
        expect(input).toHaveValue("oldname");
        await user.clear(input);
        await user.type(input, "newname");
        mockedUpdateUsernameAlias.mockResolvedValueOnce(alias({ uid: "n2", type: "name", alias: "newname", verified: true }));

        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(mockedUpdateUsernameAlias).toHaveBeenCalledWith("n1", "newname");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("newname")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when changing the username fails, without closing the modal", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "n1", type: "name", alias: "oldname", verified: true })]);
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Change" }));
        mockedUpdateUsernameAlias.mockRejectedValueOnce(new ApiRequestError("taken", 409));

        await user.clear(screen.getByLabelText("Username"));
        await user.type(screen.getByLabelText("Username"), "newname");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("taken")).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("shows a generic message when changing the username fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "n1", type: "name", alias: "oldname", verified: true })]);
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Change" }));
        mockedUpdateUsernameAlias.mockRejectedValueOnce(new TypeError("boom"));

        await user.clear(screen.getByLabelText("Username"));
        await user.type(screen.getByLabelText("Username"), "newname");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByText("Could not change your username.")).toBeInTheDocument();
    });

    it("clears the error and value when the change-username modal is closed and reopened", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "n1", type: "name", alias: "oldname", verified: true })]);
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Change" }));
        mockedUpdateUsernameAlias.mockRejectedValueOnce(new ApiRequestError("taken", 409));
        await user.clear(screen.getByLabelText("Username"));
        await user.type(screen.getByLabelText("Username"), "newname");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await screen.findByText("taken");

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Change" }));
        expect(screen.getByLabelText("Username")).toHaveValue("oldname");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

describe("AccountPage — contacts loading", () => {
    it("shows the ApiRequestError message on alias load failure", async () => {
        mockedListAliases.mockReset();
        mockedListAliases.mockRejectedValueOnce(new ApiRequestError("nope", 500));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when listing aliases fails with a non-API error", async () => {
        mockedListAliases.mockReset();
        mockedListAliases.mockRejectedValueOnce(new TypeError("boom"));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("Could not load your aliases.")).toBeInTheDocument();
    });

    it("renders no table when there are no contacts", async () => {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");
        expect(screen.queryByRole("table")).toBeNull();
    });
});

describe("AccountPage — contacts table", () => {
    it("renders an unverified contact with a Verify action", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByText("Unverified")).toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Verify" })).toBeInTheDocument();
    });

    it("renders a verified contact with no matching alias as 'Enable'", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);
        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByText("Verified")).toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Enable" })).toBeInTheDocument();
    });

    it("renders a verified contact with a matching alias as 'Disable'", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ alias: "ada@example.com", type: "email" })]);
        render(<AccountPage userUid="u1" />);
        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByRole("button", { name: "Disable" })).toBeInTheDocument();
    });

    async function openAddContactModal(user: ReturnType<typeof userEvent.setup>) {
        await screen.findByText("Contacts");
        await user.click(within(contactsCard()).getByRole("button", { name: "+ Add" }));
        return screen.getByRole("dialog", { name: "Add a contact" });
    }

    it("adds a contact (creating the profile, since none existed) and opens the verify modal", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        const dialog = await openAddContactModal(user);
        mockedCreateProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ contact: "new@example.com", verified: false })] }));

        await user.type(within(dialog).getByLabelText("E-mail address"), "new@example.com");
        await user.click(within(dialog).getByRole("button", { name: "Add" }));

        expect(mockedCreateProfile).toHaveBeenCalledWith({
            contacts: [{ contact: "new@example.com", type: "email", verified: false }],
        });
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a contact" })).not.toBeInTheDocument());
        expect(await screen.findByText("We sent a code to new@example.com.")).toBeInTheDocument();
    });

    it("adds a phone contact via the type selector to an existing profile", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ version: 1, contacts: [contact()] }));
        render(<AccountPage userUid="u1" />);
        const dialog = await openAddContactModal(user);
        mockedUpdateProfile.mockResolvedValueOnce(
            profileObj({ version: 2, contacts: [contact(), contact({ contact: "+15551234567", type: "phone", verified: false })] }),
        );

        await user.click(within(dialog).getByRole("button", { name: "Phone" }));
        const input = within(dialog).getByLabelText("Phone number");
        await user.type(input, "+15551234567");
        await user.click(within(dialog).getByRole("button", { name: "Add" }));

        await waitFor(() =>
            expect(mockedUpdateProfile).toHaveBeenCalledWith({
                uid: "u1",
                version: 1,
                contacts: [contact(), { contact: "+15551234567", type: "phone", verified: false }],
            }),
        );
        expect(await screen.findByText("We sent a code to +15551234567.")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when adding a contact fails, without closing the modal", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        const dialog = await openAddContactModal(user);
        mockedCreateProfile.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.type(within(dialog).getByLabelText("E-mail address"), "new@example.com");
        await user.click(within(dialog).getByRole("button", { name: "Add" }));

        expect(await within(dialog).findByText("nope")).toBeInTheDocument();
        expect(screen.getByRole("dialog", { name: "Add a contact" })).toBeInTheDocument();
    });

    it("shows a generic message when adding a contact fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        const dialog = await openAddContactModal(user);
        mockedCreateProfile.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(within(dialog).getByLabelText("E-mail address"), "new@example.com");
        await user.click(within(dialog).getByRole("button", { name: "Add" }));

        expect(await within(dialog).findByText("Could not add that contact.")).toBeInTheDocument();
    });

    it("clears the type/value and error when the add-contact modal is closed and reopened", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        let dialog = await openAddContactModal(user);
        mockedCreateProfile.mockRejectedValueOnce(new ApiRequestError("nope", 400));
        await user.click(within(dialog).getByRole("button", { name: "Phone" }));
        await user.type(within(dialog).getByLabelText("Phone number"), "+15551234567");
        await user.click(within(dialog).getByRole("button", { name: "Add" }));
        await within(dialog).findByText("nope");

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        dialog = await openAddContactModal(user);
        expect(within(dialog).getByRole("button", { name: "E-mail" })).toHaveAttribute("aria-pressed", "true");
        expect(within(dialog).getByRole("button", { name: "Phone" })).toHaveAttribute("aria-pressed", "false");
        expect(within(dialog).queryByText("nope")).toBeNull();
    });

    it("verifies a contact successfully, updating the profile and closing the modal", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("We sent a code to ada@example.com.")).toBeInTheDocument();

        mockedVerifyContact.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        await user.type(screen.getByLabelText("Verification code"), "123456");
        await user.click(within(dialog).getByRole("button", { name: "Verify" }));

        expect(mockedVerifyContact).toHaveBeenCalledWith("ada@example.com", "123456");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("Verified")).toBeInTheDocument();
    });

    it("shows a fixed message on an invalid verification code", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        mockedVerifyContact.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.type(screen.getByLabelText("Verification code"), "000000");
        await user.click(within(dialog).getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired code.");
    });

    it("shows a generic message when verification fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        mockedVerifyContact.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("Verification code"), "000000");
        await user.click(within(dialog).getByRole("button", { name: "Verify" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    });

    it("resends a verification code and shows a confirmation", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        mockedResendContactVerificationCode.mockResolvedValueOnce(undefined);

        await user.click(within(dialog).getByRole("button", { name: "Resend" }));

        expect(mockedResendContactVerificationCode).toHaveBeenCalledWith("ada@example.com");
        expect(await within(dialog).findByText("Sent.")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when resending fails", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        mockedResendContactVerificationCode.mockRejectedValueOnce(new ApiRequestError("rate limited", 429));

        await user.click(within(dialog).getByRole("button", { name: "Resend" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("rate limited");
        expect(within(dialog).queryByText("Sent.")).toBeNull();
    });

    it("shows a generic message when resending fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        const dialog = screen.getByRole("dialog");
        mockedResendContactVerificationCode.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(within(dialog).getByRole("button", { name: "Resend" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not resend the code.");
    });

    it("clears the resend confirmation and error when the verify modal is closed and reopened", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: false })] }));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Verify" }));
        let dialog = screen.getByRole("dialog");
        mockedResendContactVerificationCode.mockResolvedValueOnce(undefined);
        await user.click(within(dialog).getByRole("button", { name: "Resend" }));
        await within(dialog).findByText("Sent.");

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Verify" }));
        dialog = screen.getByRole("dialog");
        expect(within(dialog).queryByText("Sent.")).toBeNull();
    });

    it("enables sign-in for a verified contact", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);
        mockedCreateAlias.mockResolvedValueOnce(alias({ uid: "a2", alias: "ada@example.com", type: "email", verified: true }));

        await user.click(await screen.findByRole("button", { name: "Enable" }));

        expect(mockedCreateAlias).toHaveBeenCalledWith("email", "ada@example.com", true);
        expect(await screen.findByRole("button", { name: "Disable" })).toBeInTheDocument();
    });

    it("disables sign-in for a verified contact when another enabled alias remains", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(
            profileObj({ contacts: [contact({ verified: true }), contact({ contact: "second@example.com", verified: true })] }),
        );
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([
            alias({ uid: "a2", alias: "ada@example.com", type: "email" }),
            alias({ uid: "a3", alias: "second@example.com", type: "email" }),
        ]);
        render(<AccountPage userUid="u1" />);
        mockedDeleteAlias.mockResolvedValueOnce();

        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        await user.click(within(row).getByRole("button", { name: "Disable" }));

        expect(mockedDeleteAlias).toHaveBeenCalledWith("a2");
        expect(await within(row).findByRole("button", { name: "Enable" })).toBeInTheDocument();
    });

    it("disables the Disable action when it is the only enabled sign-in method", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "a2", alias: "ada@example.com", type: "email" })]);
        render(<AccountPage userUid="u1" />);

        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByRole("button", { name: "Disable" })).toBeDisabled();
    });

    it("shows the ApiRequestError message when toggling sign-in fails", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);
        mockedCreateAlias.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.click(await screen.findByRole("button", { name: "Enable" }));

        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when toggling sign-in fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);
        mockedCreateAlias.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(await screen.findByRole("button", { name: "Enable" }));

        expect(await screen.findByText("Could not update that contact's sign-in setting.")).toBeInTheDocument();
    });

    // Every "remove" test below includes a second, already-verified contact (with no alias of its own)
    // so the target contact is never the account's last verified contact — otherwise Remove would be
    // disabled by the minimum-contact guard covered separately below.
    const secondContact = contact({ contact: "second@example.com", verified: true });

    it("does nothing when contact removal is declined", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn(() => false);
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact(), secondContact] }));
        render(<AccountPage userUid="u1" />);
        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        expect(mockedUpdateProfile).not.toHaveBeenCalled();
        expect(row).toBeInTheDocument();
    });

    it("removes a contact (no matching alias), updating the profile only", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ version: 5, contacts: [contact(), secondContact] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);
        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;
        mockedUpdateProfile.mockResolvedValueOnce(profileObj({ version: 6, contacts: [secondContact] }));

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() =>
            expect(mockedUpdateProfile).toHaveBeenCalledWith({ uid: "u1", version: 5, contacts: [secondContact] }),
        );
        expect(mockedDeleteAlias).not.toHaveBeenCalled();
        expect(screen.queryByText("ada@example.com")).toBeNull();
    });

    it("removes a contact and cascades to deleting its matching alias", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ version: 5, contacts: [contact(), secondContact] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([
            alias({ uid: "a2", alias: "ada@example.com", type: "email" }),
            alias({ uid: "a3", alias: "second@example.com", type: "email" }),
        ]);
        render(<AccountPage userUid="u1" />);
        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;
        mockedUpdateProfile.mockResolvedValueOnce(profileObj({ version: 6, contacts: [secondContact] }));
        mockedDeleteAlias.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteAlias).toHaveBeenCalledWith("a2"));
    });

    it("shows the ApiRequestError message when removing a contact fails", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact(), secondContact] }));
        render(<AccountPage userUid="u1" />);
        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;
        mockedUpdateProfile.mockRejectedValueOnce(new ApiRequestError("cannot remove", 403));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("cannot remove")).toBeInTheDocument();
    });

    it("shows a generic message when removing a contact fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact(), secondContact] }));
        render(<AccountPage userUid="u1" />);
        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;
        mockedUpdateProfile.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that contact.")).toBeInTheDocument();
    });

    it("disables Remove when the contact is the account's last verified contact", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([]);
        render(<AccountPage userUid="u1" />);

        const row = within(await screen.findByRole("table")).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByRole("button", { name: "Remove" })).toBeDisabled();
    });

    it("disables Remove when the contact is the account's last enabled sign-in alias, even if not the last verified contact", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(
            profileObj({ contacts: [contact({ verified: true }), contact({ contact: "unverified@example.com", verified: false })] }),
        );
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ uid: "a2", alias: "ada@example.com", type: "email" })]);
        render(<AccountPage userUid="u1" />);

        const table = await screen.findByRole("table");
        const row = within(table).getByText("ada@example.com").closest("tr")!;
        expect(within(row).getByRole("button", { name: "Remove" })).toBeDisabled();
        // The unverified contact isn't gated by either rule — it has no alias and isn't the last verified one.
        const otherRow = within(table).getByText("unverified@example.com").closest("tr")!;
        expect(within(otherRow).getByRole("button", { name: "Remove" })).toBeEnabled();
    });
});

describe("AccountPage — formatDate fallback", () => {
    it("falls back to the raw ISO string if toLocaleDateString throws", async () => {
        vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementationOnce(() => {
            throw new RangeError("boom");
        });
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp", dateCreated: "2026-01-01T00:00:00.000Z" })]);
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("2026-01-01T00:00:00.000Z")).toBeInTheDocument();
    });

    it("renders an empty date when dateCreated is missing", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp", dateCreated: "" })]);
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Authenticator app");
        const row = screen.getByText("Authenticator app").closest("tr")!;
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("");
    });
});

describe("AccountPage — secrets loading", () => {
    it("shows the ApiRequestError message on failure", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockRejectedValueOnce(new ApiRequestError("nope", 500));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when listing secrets fails with a non-API error", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockRejectedValueOnce(new TypeError("boom"));
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("Could not load your sign-in methods.")).toBeInTheDocument();
    });

    it("renders an empty state with no sign-in methods", async () => {
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("No sign-in methods added yet.")).toBeInTheDocument();
        expect(screen.queryByRole("table")).toBeNull();
    });

    it("renders a table row per existing secret", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([
            secret({ uid: "sp", type: "password" }),
            secret({ uid: "st", type: "totp" }),
            secret({ uid: "sk", type: "passkey" }),
            secret({ uid: "sf", type: "fido2" }),
        ]);
        render(<AccountPage userUid="u1" />);

        expect(await screen.findByText("Password")).toBeInTheDocument();
        expect(screen.getByText("Authenticator app")).toBeInTheDocument();
        expect(screen.getByText("Passkey")).toBeInTheDocument();
        expect(screen.getByText("Hardware key")).toBeInTheDocument();
    });

    it("removes a secret after confirmation", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("Authenticator app")).closest("tr")!;
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("totp1"));
        expect(await screen.findByText("No sign-in methods added yet.")).toBeInTheDocument();
    });

    it("does nothing to remove a secret when the confirmation is declined", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn(() => false);
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("Authenticator app")).closest("tr")!;

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(mockedDeleteSecret).not.toHaveBeenCalled();
    });

    it("shows the ApiRequestError message when removal fails", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("Authenticator app")).closest("tr")!;
        mockedDeleteSecret.mockRejectedValueOnce(new ApiRequestError("cannot delete", 403));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("cannot delete")).toBeInTheDocument();
    });

    it("shows a generic message when removal fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("Authenticator app")).closest("tr")!;
        mockedDeleteSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that sign-in method.")).toBeInTheDocument();
    });
});

describe("AccountPage — add sign-in method modal", () => {
    async function openAddModal(user: ReturnType<typeof userEvent.setup>) {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await screen.findByRole("dialog", { name: "Add a sign-in method" });
    }

    it("shows the four type options, and none of their forms, until one is picked", async () => {
        const user = userEvent.setup();
        await openAddModal(user);
        expect(screen.getByRole("button", { name: "Password" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Authenticator app" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Passkey" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Hardware key" })).toBeInTheDocument();
        expect(screen.queryByLabelText("New password")).toBeNull();
    });

    it("resets the picked type and any in-progress input when the modal is closed and reopened", async () => {
        const user = userEvent.setup();
        await openAddModal(user);
        await user.click(screen.getByRole("button", { name: "Password" }));
        await user.type(screen.getByLabelText("New password"), "something");

        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        expect(screen.getByRole("button", { name: "Password" })).toBeInTheDocument();
        expect(screen.queryByLabelText("New password")).toBeNull();
    });
});

describe("AccountPage — password", () => {
    async function goToPasswordForm(user: ReturnType<typeof userEvent.setup>) {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Password" }));
    }

    it("validates live as you type and disables submit for a weak password", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);

        await user.type(screen.getByLabelText("New password"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();
    });

    it("shows a mismatch error and disables submit when confirmation differs", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Different1!");

        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();
    });

    it("re-validates a weak password on a force-submit", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        await user.type(screen.getByLabelText("New password"), "weak");

        const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
        fireEvent.submit(form);
        expect(await screen.findByText("Password does not meet the requirements below.")).toBeInTheDocument();
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("re-validates a mismatch on a force-submit", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Different1!");

        const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
        fireEvent.submit(form);
        expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("sets a first password (no prior password secret to delete), closing the modal", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedCreatePasswordSecret).toHaveBeenCalledWith("Sup3r$ecret1", undefined);
        expect(mockedDeleteSecret).not.toHaveBeenCalled();
        expect(screen.getByText("Password")).toBeInTheDocument();
    });

    it("passes a trimmed label through as the hint when one is entered", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw", hint: "LastPass" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Label (optional)"), "  LastPass  ");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedCreatePasswordSecret).toHaveBeenCalledWith("Sup3r$ecret1", "LastPass");
        expect(screen.getByText("(LastPass)")).toBeInTheDocument();
    });

    it("changes an existing password, deleting the old secret", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "oldpw", type: "password" })]);
        await goToPasswordForm(user);
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("oldpw"));
    });

    it("shows the ApiRequestError message when saving the password fails", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        mockedCreatePasswordSecret.mockRejectedValueOnce(new ApiRequestError("too weak", 400));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        expect(await screen.findByText("too weak")).toBeInTheDocument();
    });

    it("shows a generic message when saving the password fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToPasswordForm(user);
        mockedCreatePasswordSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        expect(await screen.findByText("Could not save your password.")).toBeInTheDocument();
    });
});

describe("AccountPage — password requirements fetch failure", () => {
    it("keeps the fallback requirements when GET /secrets/password fails", async () => {
        mockedGetPasswordRequirements.mockReset();
        mockedGetPasswordRequirements.mockRejectedValueOnce(new Error("offline"));
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Password" }));
        await user.type(screen.getByLabelText("New password"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });
});

describe("AccountPage — authenticator app (TOTP)", () => {
    async function goToTotp(user: ReturnType<typeof userEvent.setup>) {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Authenticator app" }));
    }

    it("adds one, renders the QR code, and appends it to the list on Done", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        mockedCreateTotpSecret.mockResolvedValueOnce({
            ...secret({ uid: "totp1", type: "totp" }),
            data: { secret: "ABCD1234", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        });
        mockedToDataURL.mockResolvedValueOnce("data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));

        expect(await screen.findByText("ABCD1234")).toBeInTheDocument();
        expect(mockedCreateTotpSecret).toHaveBeenCalledWith(undefined);
        expect(mockedToDataURL).toHaveBeenCalledWith("otpauth://totp/x", { width: 220, margin: 1 });
        expect(screen.getByAltText("Authenticator app QR code")).toHaveAttribute("src", "data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    });

    it("goes straight to secret creation with no intermediate confirm step, and passes a trimmed label as the hint", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        // No "Add an authenticator app to continue"-only screen — the very first thing shown after picking
        // "Authenticator app" is already the hint form whose submit performs the creation directly.
        expect(screen.getByLabelText("Label (optional)")).toBeInTheDocument();
        mockedCreateTotpSecret.mockResolvedValueOnce({
            ...secret({ uid: "totp1", type: "totp", hint: "LastPass" }),
            data: { secret: "ABCD1234", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        });
        mockedToDataURL.mockResolvedValueOnce("data:image/png;base64,xyz");

        await user.type(screen.getByLabelText("Label (optional)"), "  LastPass  ");
        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));

        expect(await screen.findByText("ABCD1234")).toBeInTheDocument();
        expect(mockedCreateTotpSecret).toHaveBeenCalledWith("LastPass");

        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(screen.getByText("(LastPass)")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when adding fails", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        mockedCreateTotpSecret.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when adding fails with a non-API error", async () => {
        const user = userEvent.setup();
        await goToTotp(user);
        mockedCreateTotpSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        expect(await screen.findByText("Could not add an authenticator app.")).toBeInTheDocument();
    });
});

describe("AccountPage — passkey", () => {
    async function goToPasskey(user: ReturnType<typeof userEvent.setup>) {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Passkey" }));
    }

    it("adds a passkey via WebAuthn registration, closing the modal", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterPasskey.mockResolvedValueOnce(secret({ uid: "cred1", type: "passkey" }));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedStartRegistration).toHaveBeenCalledWith({ optionsJSON: options });
        expect(mockedRegisterPasskey).toHaveBeenCalledWith(response, undefined);
        expect(screen.getByText("Passkey")).toBeInTheDocument();
    });

    it("passes a trimmed label through as the hint when one is entered", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterPasskey.mockResolvedValueOnce(secret({ uid: "cred1", type: "passkey", hint: "iPhone" }));

        await user.type(screen.getByLabelText("Label (optional)"), "  iPhone  ");
        await user.click(screen.getByRole("button", { name: "Add passkey" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedRegisterPasskey).toHaveBeenCalledWith(response, "iPhone");
        expect(screen.getByText("(iPhone)")).toBeInTheDocument();
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartRegistration.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("Passkey setup was cancelled.")).toBeInTheDocument();
    });

    it("shows the underlying ApiRequestError message when registration fails", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyRegistrationOptions.mockRejectedValueOnce(new ApiRequestError("session expired", 400));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("session expired")).toBeInTheDocument();
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToPasskey(user);
        mockedGetPasskeyRegistrationOptions.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("Could not add a passkey.")).toBeInTheDocument();
    });
});

describe("AccountPage — FIDO2 security key", () => {
    async function goToFido2(user: ReturnType<typeof userEvent.setup>) {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Hardware key" }));
    }

    it("adds a security key via WebAuthn registration, closing the modal", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterFido2.mockResolvedValueOnce(secret({ uid: "cred1", type: "fido2" }));

        await user.click(screen.getByRole("button", { name: "Add security key" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedRegisterFido2).toHaveBeenCalledWith(response, undefined);
        expect(screen.getByText("Hardware key")).toBeInTheDocument();
    });

    it("passes a trimmed label through as the hint when one is entered", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterFido2.mockResolvedValueOnce(secret({ uid: "cred1", type: "fido2", hint: "YubiKey" }));

        await user.type(screen.getByLabelText("Label (optional)"), "  YubiKey  ");
        await user.click(screen.getByRole("button", { name: "Add security key" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockedRegisterFido2).toHaveBeenCalledWith(response, "YubiKey");
        expect(screen.getByText("(YubiKey)")).toBeInTheDocument();
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartRegistration.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("Hardware key setup was cancelled.")).toBeInTheDocument();
    });

    it("shows the underlying ApiRequestError message when registration fails", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2RegistrationOptions.mockRejectedValueOnce(new ApiRequestError("session expired", 400));

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("session expired")).toBeInTheDocument();
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        await goToFido2(user);
        mockedGetFido2RegistrationOptions.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("Could not add a security key.")).toBeInTheDocument();
    });
});

describe("AccountPage — state updaters fire while the initial list is still loading", () => {
    // aliases/secrets start out `null` until listAliases()/listSecrets() resolves, but the "add" forms
    // and buttons are rendered unconditionally regardless — so a fast user (or a slow network) can fire
    // these handlers before the initial load finishes. Each setter's `prev ?? []` fallback only
    // exercises with `prev` still `null`, which requires the list request to still be pending.

    it("handleAddUsername seeds the list from [] when aliases hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByPlaceholderText("username");
        mockedCreateUsernameAlias.mockResolvedValueOnce(alias({ uid: "n1", type: "name", alias: "coolname", verified: true }));

        await user.type(screen.getByPlaceholderText("username"), "coolname");
        await user.click(within(screen.getByPlaceholderText("username").closest("form")!).getByRole("button", { name: "Add" }));

        expect(await screen.findByText("coolname")).toBeInTheDocument();
    });

    it("handleToggleContactSignIn seeds the list from [] when aliases hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce(profileObj({ contacts: [contact({ verified: true })] }));
        mockedListAliases.mockReset();
        mockedListAliases.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        mockedCreateAlias.mockResolvedValueOnce(alias({ uid: "a2", alias: "ada@example.com", type: "email", verified: true }));

        await user.click(await screen.findByRole("button", { name: "Enable" }));

        expect(await screen.findByRole("button", { name: "Disable" })).toBeInTheDocument();
    });

    it("handlePasswordSubmit seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Password" }));
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("Password")).toBeInTheDocument();
    });

    it("handleAddTotp seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Authenticator app" }));
        mockedCreateTotpSecret.mockResolvedValueOnce({
            ...secret({ uid: "totp1", type: "totp" }),
            data: { secret: "ABCD1234", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        });
        mockedToDataURL.mockResolvedValueOnce("data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        await screen.findByText("ABCD1234");
        await user.click(screen.getByRole("button", { name: "Done" }));

        expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    });

    it("handleAddPasskey seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Passkey" }));
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce({});
        mockedStartRegistration.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedRegisterPasskey.mockResolvedValueOnce(secret({ uid: "cred1", type: "passkey" }));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("Passkey")).toBeInTheDocument();
    });

    it("handleAddFido2 seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Sign-in methods");
        await user.click(within(secretsCard()).getByRole("button", { name: "+ Add" }));
        await user.click(screen.getByRole("button", { name: "Hardware key" }));
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce({});
        mockedStartRegistration.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedRegisterFido2.mockResolvedValueOnce(secret({ uid: "cred1", type: "fido2" }));

        await user.click(screen.getByRole("button", { name: "Add security key" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(screen.getByText("Hardware key")).toBeInTheDocument();
    });
});

describe("AccountPage — logout", () => {
    it("logs out and redirects to /auth/signin", async () => {
        const user = userEvent.setup();
        const location = mockLocation();
        mockedLogout.mockResolvedValueOnce();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Save profile");

        await user.click(screen.getByRole("button", { name: "Log out" }));

        await waitFor(() => expect(location.href).toBe("/auth/signin"));
        expect(mockedLogout).toHaveBeenCalled();
    });
});
