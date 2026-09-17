// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { afterEach, describe, expect, it } from "vitest";
import { jsonResponse, mockFetch } from "../testUtils.js";
import { getSystemSettings, updateSystemSettings } from "../../../apps/shared/lib/systemSettings.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("getSystemSettings", () => {
    it("fetches /settings", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { allowRegistration: true }));
        const result = await getSystemSettings();
        expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.anything());
        expect(result).toEqual({ allowRegistration: true });
    });
});

describe("updateSystemSettings", () => {
    it("PUTs the given fields to /settings", async () => {
        const fetchMock = mockFetch(() => jsonResponse(200, { allowRegistration: false, requireMFA: true }));
        const result = await updateSystemSettings({ allowRegistration: false, requireMFA: true });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/settings",
            expect.objectContaining({
                method: "PUT",
                body: JSON.stringify({ allowRegistration: false, requireMFA: true }),
            }),
        );
        expect(result).toEqual({ allowRegistration: false, requireMFA: true });
    });
});
