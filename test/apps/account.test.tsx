// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "./testUtils.js";
import { FALLBACK_PASSWORD_REQUIREMENTS } from "../../apps/www/_lib/passwordCriteria.js";

vi.mock("@simplewebauthn/browser", () => ({
    startRegistration: vi.fn(),
}));

vi.mock("qrcode", () => ({
    default: { toDataURL: vi.fn() },
}));

vi.mock("../../apps/www/_lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../apps/www/_lib/api.js")>();
    return {
        ...actual,
        logout: vi.fn(),
        createAlias: vi.fn(),
        createPasswordSecret: vi.fn(),
        createProfile: vi.fn(),
        createTotpSecret: vi.fn(),
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
        updateProfile: vi.fn(),
    };
});

import { startRegistration } from "@simplewebauthn/browser";
import QRCode from "qrcode";
import {
    ApiRequestError,
    Alias,
    SecretSummary,
    createAlias,
    createPasswordSecret,
    createProfile,
    createTotpSecret,
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
    updateProfile,
} from "../../apps/www/_lib/api.js";
import AccountPage from "../../apps/www/account/index.js";

const mockedStartRegistration = vi.mocked(startRegistration);
const mockedToDataURL = vi.mocked(QRCode.toDataURL);
const mockedLogout = vi.mocked(logout);
const mockedCreateAlias = vi.mocked(createAlias);
const mockedCreatePasswordSecret = vi.mocked(createPasswordSecret);
const mockedCreateProfile = vi.mocked(createProfile);
const mockedCreateTotpSecret = vi.mocked(createTotpSecret);
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
        mockedGetProfile.mockResolvedValueOnce({
            uid: "u1",
            version: 2,
            givenName: "Ada",
            familyName: "Lovelace",
            birthdate: "1990-01-01T08:00:00.000Z",
            contacts: [{ contact: "ada@example.com", type: "email", verified: true }],
        });
        render(<AccountPage userUid="u1" />);

        expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument();
        expect(screen.getByText("ada@example.com")).toBeInTheDocument();
        expect(screen.getByLabelText("Given name")).toHaveValue("Ada");
        expect(screen.getByLabelText("Family name")).toHaveValue("Lovelace");
        expect(screen.getByLabelText("Birthdate")).toHaveValue("1990-01-01");
    });

    it("falls back to the e-mail contact and its initial when there is no name", async () => {
        mockedGetProfile.mockReset();
        mockedGetProfile.mockResolvedValueOnce({
            uid: "u1",
            version: 0,
            contacts: [{ contact: "ada@example.com", type: "email", verified: true }],
        });
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
        mockedCreateProfile.mockResolvedValueOnce({ uid: "u1", version: 0, givenName: "Ada" });

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
        mockedGetProfile.mockResolvedValueOnce({ uid: "u1", version: 3, givenName: "Ada" });
        render(<AccountPage userUid="u1" />);
        await screen.findByDisplayValue("Ada");
        mockedUpdateProfile.mockResolvedValueOnce({ uid: "u1", version: 4, givenName: "Ada B." });

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
        mockedCreateProfile.mockResolvedValueOnce({ uid: "u1", version: 0 });

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

describe("AccountPage — aliases", () => {
    it("shows a loading state, then an ApiRequestError message on failure", async () => {
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

    it("renders a verified alias without the unverified badge, and disables Remove when it's the only one", async () => {
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("a@example.com")).closest(".rr-list-row")!;
        expect(within(row).queryByText("(unverified)")).toBeNull();
        expect(within(row).getByRole("button", { name: "Remove" })).toBeDisabled();
    });

    it("renders an unverified alias with its badge", async () => {
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias({ verified: false })]);
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("(unverified)")).toBeInTheDocument();
    });

    it("adds a phone alias via the type selector and clears the input", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias(), alias({ uid: "a2", type: "phone", alias: "+15551234567", verified: false })]);
        render(<AccountPage userUid="u1" />);
        await screen.findByText("a@example.com");

        await user.selectOptions(screen.getByDisplayValue("E-mail"), "phone");
        expect(screen.getByPlaceholderText("+1 555 123 4567")).toBeInTheDocument();
        mockedCreateAlias.mockResolvedValueOnce(alias({ uid: "a3", type: "phone", alias: "+15559876543", verified: false }));

        const input = screen.getByPlaceholderText("+1 555 123 4567");
        await user.type(input, "+15559876543");
        await user.click(screen.getByRole("button", { name: "Add" }));

        await waitFor(() => expect(mockedCreateAlias).toHaveBeenCalledWith("phone", "+15559876543"));
        expect(input).toHaveValue("");
    });

    it("shows the username placeholder for the 'name' alias type", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("a@example.com");
        await user.selectOptions(screen.getByDisplayValue("E-mail"), "name");
        expect(screen.getByPlaceholderText("username")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when adding an alias fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("a@example.com");
        mockedCreateAlias.mockRejectedValueOnce(new ApiRequestError("taken", 409));

        await user.type(screen.getByPlaceholderText("you@example.com"), "dup@example.com");
        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(await screen.findByText("taken")).toBeInTheDocument();
    });

    it("shows a generic message when adding an alias fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("a@example.com");
        mockedCreateAlias.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByPlaceholderText("you@example.com"), "dup@example.com");
        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(await screen.findByText("Could not add that alias.")).toBeInTheDocument();
    });

    it("does nothing when the removal confirmation is declined", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn(() => false);
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias(), alias({ uid: "a2", alias: "b@example.com" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("a@example.com")).closest(".rr-list-row")!;

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(mockedDeleteAlias).not.toHaveBeenCalled();
        expect(screen.getByText("a@example.com")).toBeInTheDocument();
    });

    it("removes an alias after confirmation when there is more than one", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias(), alias({ uid: "a2", alias: "b@example.com" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("b@example.com")).closest(".rr-list-row")!;
        mockedDeleteAlias.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteAlias).toHaveBeenCalledWith("a2"));
        expect(screen.queryByText("b@example.com")).toBeNull();
    });

    it("shows the ApiRequestError message when removing an alias fails", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias(), alias({ uid: "a2", alias: "b@example.com" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("b@example.com")).closest(".rr-list-row")!;
        mockedDeleteAlias.mockRejectedValueOnce(new ApiRequestError("cannot delete", 403));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("cannot delete")).toBeInTheDocument();
    });

    it("shows a generic message when removing an alias fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockResolvedValueOnce([alias(), alias({ uid: "a2", alias: "b@example.com" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText("b@example.com")).closest(".rr-list-row")!;
        mockedDeleteAlias.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that alias.")).toBeInTheDocument();
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
        expect(await screen.findByText("Authenticator app added 2026-01-01T00:00:00.000Z")).toBeInTheDocument();
    });

    it("renders an empty date when dateCreated is missing", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp", dateCreated: "" })]);
        render(<AccountPage userUid="u1" />);
        expect(await screen.findByText("Authenticator app added")).toBeInTheDocument();
    });
});

describe("AccountPage — password requirements fetch failure", () => {
    it("keeps the fallback requirements when GET /secrets/password fails", async () => {
        mockedGetPasswordRequirements.mockReset();
        mockedGetPasswordRequirements.mockRejectedValueOnce(new Error("offline"));
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        await user.type(screen.getByLabelText("New password"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
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

    it("renders empty states for every sign-in method category", async () => {
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No password set");
        expect(screen.getByText("No authenticator apps added yet.")).toBeInTheDocument();
        expect(screen.getByText("No passkeys added yet.")).toBeInTheDocument();
        expect(screen.getByText("No security keys added yet.")).toBeInTheDocument();
    });

    it("renders an existing entry per sign-in method category", async () => {
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([
            secret({ uid: "sp", type: "password" }),
            secret({ uid: "st", type: "totp" }),
            secret({ uid: "sk", type: "passkey" }),
            secret({ uid: "sf", type: "fido2" }),
        ]);
        render(<AccountPage userUid="u1" />);

        expect(await screen.findByText("Password is set")).toBeInTheDocument();
        expect(screen.getByText(/Authenticator app added/)).toBeInTheDocument();
        expect(screen.getByText(/Passkey added/)).toBeInTheDocument();
        expect(screen.getByText(/Security key added/)).toBeInTheDocument();
    });
});

describe("AccountPage — password", () => {
    it("shows 'Set password' with no existing password, and validates live as you type", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));

        await user.type(screen.getByLabelText("New password"), "a");
        expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();
    });

    it("shows a mismatch error and disables submit when confirmation differs", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Different1!");

        expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save password" })).toBeDisabled();
    });

    it("re-validates a weak password on a force-submit", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        await user.type(screen.getByLabelText("New password"), "weak");

        const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
        fireEvent.submit(form);
        expect(await screen.findByText("Password does not meet the requirements below.")).toBeInTheDocument();
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("re-validates a mismatch on a force-submit", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Different1!");

        const form = screen.getByRole("button", { name: "Save password" }).closest("form")!;
        fireEvent.submit(form);
        expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
        expect(mockedCreatePasswordSecret).not.toHaveBeenCalled();
    });

    it("cancels the password form, clearing its fields and error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        await user.type(screen.getByLabelText("New password"), "weak");

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByText("No password set")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Set password" }));
        expect(screen.getByLabelText("New password")).toHaveValue("");
    });

    it("sets a first password (no prior password secret to delete)", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await screen.findByText("Password is set");
        expect(mockedCreatePasswordSecret).toHaveBeenCalledWith("Sup3r$ecret1");
        expect(mockedDeleteSecret).not.toHaveBeenCalled();
    });

    it("changes an existing password, deleting the old secret", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "oldpw", type: "password" })]);
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Change password" }));
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("oldpw"));
        expect(screen.getByText("Password is set")).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when saving the password fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        mockedCreatePasswordSecret.mockRejectedValueOnce(new ApiRequestError("too weak", 400));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        expect(await screen.findByText("too weak")).toBeInTheDocument();
    });

    it("shows a generic message when saving the password fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        mockedCreatePasswordSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        expect(await screen.findByText("Could not save your password.")).toBeInTheDocument();
    });
});

describe("AccountPage — authenticator app (TOTP)", () => {
    it("adds one, renders the QR code, and appends it to the list on Done", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No authenticator apps added yet.");
        mockedCreateTotpSecret.mockResolvedValueOnce({
            ...secret({ uid: "totp1", type: "totp" }),
            data: { secret: "ABCD1234", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        });
        mockedToDataURL.mockResolvedValueOnce("data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));

        expect(await screen.findByText("ABCD1234")).toBeInTheDocument();
        expect(mockedToDataURL).toHaveBeenCalledWith("otpauth://totp/x", { width: 220, margin: 1 });
        expect(screen.getByAltText("Authenticator app QR code")).toHaveAttribute("src", "data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(screen.queryByText("ABCD1234")).toBeNull();
        expect(screen.getByText(/Authenticator app added/)).toBeInTheDocument();
    });

    it("shows the ApiRequestError message when adding fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No authenticator apps added yet.");
        mockedCreateTotpSecret.mockRejectedValueOnce(new ApiRequestError("nope", 400));

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("shows a generic message when adding fails with a non-API error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No authenticator apps added yet.");
        mockedCreateTotpSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        expect(await screen.findByText("Could not add an authenticator app.")).toBeInTheDocument();
    });

    it("removes an authenticator app after confirmation", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Authenticator app added/)).closest(".rr-list-row")!;
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("totp1"));
        expect(screen.getByText("No authenticator apps added yet.")).toBeInTheDocument();
    });

    it("does nothing to remove a secret when the confirmation is declined", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn(() => false);
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Authenticator app added/)).closest(".rr-list-row")!;

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(mockedDeleteSecret).not.toHaveBeenCalled();
    });

    it("shows the ApiRequestError message when removal fails", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Authenticator app added/)).closest(".rr-list-row")!;
        mockedDeleteSecret.mockRejectedValueOnce(new ApiRequestError("cannot delete", 403));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("cannot delete")).toBeInTheDocument();
    });

    it("shows a generic message when removal fails with a non-API error", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "totp1", type: "totp" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Authenticator app added/)).closest(".rr-list-row")!;
        mockedDeleteSecret.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(within(row).getByRole("button", { name: "Remove" }));
        expect(await screen.findByText("Could not remove that sign-in method.")).toBeInTheDocument();
    });
});

describe("AccountPage — passkey", () => {
    it("adds a passkey via WebAuthn registration", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No passkeys added yet.");
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterPasskey.mockResolvedValueOnce(secret({ uid: "cred1", type: "passkey" }));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));

        await screen.findByText(/Passkey added/);
        expect(mockedStartRegistration).toHaveBeenCalledWith({ optionsJSON: options });
        expect(mockedRegisterPasskey).toHaveBeenCalledWith(response);
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No passkeys added yet.");
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartRegistration.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("Passkey setup was cancelled.")).toBeInTheDocument();
    });

    it("shows the underlying ApiRequestError message when registration fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No passkeys added yet.");
        mockedGetPasskeyRegistrationOptions.mockRejectedValueOnce(new ApiRequestError("session expired", 400));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("session expired")).toBeInTheDocument();
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No passkeys added yet.");
        mockedGetPasskeyRegistrationOptions.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));
        expect(await screen.findByText("Could not add a passkey.")).toBeInTheDocument();
    });

    it("removes a passkey after confirmation", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "cred1", type: "passkey" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Passkey added/)).closest(".rr-list-row")!;
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("cred1"));
        expect(screen.getByText("No passkeys added yet.")).toBeInTheDocument();
    });
});

describe("AccountPage — FIDO2 security key", () => {
    it("adds a security key via WebAuthn registration", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No security keys added yet.");
        const options = { challenge: "c" };
        const response = { id: "cred1" };
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce(options);
        mockedStartRegistration.mockResolvedValueOnce(response as any);
        mockedRegisterFido2.mockResolvedValueOnce(secret({ uid: "cred1", type: "fido2" }));

        await user.click(screen.getByRole("button", { name: "Add security key" }));

        await screen.findByText(/Security key added/);
        expect(mockedRegisterFido2).toHaveBeenCalledWith(response);
    });

    it("shows a cancellation message on NotAllowedError", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No security keys added yet.");
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce({});
        const cancelled = new Error("cancelled");
        cancelled.name = "NotAllowedError";
        mockedStartRegistration.mockRejectedValueOnce(cancelled);

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("Security key setup was cancelled.")).toBeInTheDocument();
    });

    it("shows the underlying ApiRequestError message when registration fails", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No security keys added yet.");
        mockedGetFido2RegistrationOptions.mockRejectedValueOnce(new ApiRequestError("session expired", 400));

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("session expired")).toBeInTheDocument();
    });

    it("shows a generic message on a non-API, non-cancellation error", async () => {
        const user = userEvent.setup();
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No security keys added yet.");
        mockedGetFido2RegistrationOptions.mockRejectedValueOnce(new TypeError("boom"));

        await user.click(screen.getByRole("button", { name: "Add security key" }));
        expect(await screen.findByText("Could not add a security key.")).toBeInTheDocument();
    });

    it("removes a security key after confirmation", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockResolvedValueOnce([secret({ uid: "cred1", type: "fido2" })]);
        render(<AccountPage userUid="u1" />);
        const row = (await screen.findByText(/Security key added/)).closest(".rr-list-row")!;
        mockedDeleteSecret.mockResolvedValueOnce();

        await user.click(within(row).getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(mockedDeleteSecret).toHaveBeenCalledWith("cred1"));
        expect(screen.getByText("No security keys added yet.")).toBeInTheDocument();
    });
});

describe("AccountPage — state updaters fire while the initial list is still loading", () => {
    // aliases/secrets start out `null` until listAliases()/listSecrets() resolves, but the "add" forms
    // and buttons are rendered unconditionally regardless — so a fast user (or a slow network) can fire
    // these handlers before the initial load finishes. Each setter's `prev ?? []` fallback only
    // exercises with `prev` still `null`, which requires the list request to still be pending.

    it("handleAddAlias seeds the list from [] when aliases hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListAliases.mockReset();
        mockedListAliases.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("Loading…");
        mockedCreateAlias.mockResolvedValueOnce(alias({ uid: "new1", alias: "new@example.com" }));

        await user.type(screen.getByPlaceholderText("you@example.com"), "new@example.com");
        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    });

    it("handlePasswordSubmit seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await user.click(await screen.findByRole("button", { name: "Set password" }));
        mockedCreatePasswordSecret.mockResolvedValueOnce(secret({ uid: "newpw" }));

        await user.type(screen.getByLabelText("New password"), "Sup3r$ecret1");
        await user.type(screen.getByLabelText("Confirm new password"), "Sup3r$ecret1");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        await screen.findByText("Password is set");
    });

    it("handleAddTotp seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No authenticator apps added yet.");
        mockedCreateTotpSecret.mockResolvedValueOnce({
            ...secret({ uid: "totp1", type: "totp" }),
            data: { secret: "ABCD1234", digits: 6, period: 30, algorithm: "sha1", uri: "otpauth://totp/x" },
        });
        mockedToDataURL.mockResolvedValueOnce("data:image/png;base64,xyz");

        await user.click(screen.getByRole("button", { name: "Add authenticator app" }));
        await screen.findByText("ABCD1234");
        await user.click(screen.getByRole("button", { name: "Done" }));

        expect(screen.getByText(/Authenticator app added/)).toBeInTheDocument();
    });

    it("handleAddPasskey seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No passkeys added yet.");
        mockedGetPasskeyRegistrationOptions.mockResolvedValueOnce({});
        mockedStartRegistration.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedRegisterPasskey.mockResolvedValueOnce(secret({ uid: "cred1", type: "passkey" }));

        await user.click(screen.getByRole("button", { name: "Add passkey" }));

        expect(await screen.findByText(/Passkey added/)).toBeInTheDocument();
    });

    it("handleAddFido2 seeds the list from [] when secrets hadn't loaded yet", async () => {
        const user = userEvent.setup();
        mockedListSecrets.mockReset();
        mockedListSecrets.mockReturnValueOnce(new Promise(() => undefined));
        render(<AccountPage userUid="u1" />);
        await screen.findByText("No security keys added yet.");
        mockedGetFido2RegistrationOptions.mockResolvedValueOnce({});
        mockedStartRegistration.mockResolvedValueOnce({ id: "cred1" } as any);
        mockedRegisterFido2.mockResolvedValueOnce(secret({ uid: "cred1", type: "fido2" }));

        await user.click(screen.getByRole("button", { name: "Add security key" }));

        expect(await screen.findByText(/Security key added/)).toBeInTheDocument();
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
