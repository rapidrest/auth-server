// @vitest-environment jsdom
///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockLocation } from "../testUtils.js";

vi.mock("../../../apps/shared/lib/api.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../apps/shared/lib/api.js")>();
    return { ...actual, refreshAccessToken: vi.fn() };
});

import { ApiRequestError, refreshAccessToken } from "../../../apps/shared/lib/api.js";
import { useSessionRefresh } from "../../../apps/shared/lib/useSessionRefresh.js";

const mockedRefreshAccessToken = vi.mocked(refreshAccessToken);
const AUTH_RESULT = { token: "tok", user: { uid: "u1", version: 1, roles: [], scopes: [] } };

afterEach(() => {
    vi.useRealTimers();
    mockedRefreshAccessToken.mockReset();
});

describe("useSessionRefresh — no userUid (no access-token cookie seen server-side)", () => {
    it("attempts a silent refresh and reloads the page on success", async () => {
        const location = mockLocation();
        mockedRefreshAccessToken.mockResolvedValueOnce(AUTH_RESULT);

        renderHook(() => useSessionRefresh(undefined));

        await waitFor(() => expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1));
        expect(location.replace).not.toHaveBeenCalled();
    });

    it("redirects to sign-in when the silent refresh fails (no valid refresh token)", async () => {
        const location = mockLocation();
        mockedRefreshAccessToken.mockRejectedValueOnce(new Error("no refresh token"));

        renderHook(() => useSessionRefresh(undefined));

        await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/auth/signin"));
        expect(location.reload).not.toHaveBeenCalled();
    });

    it("does not act on a stale response after unmount", async () => {
        const location = mockLocation();
        let resolveRefresh: (value: typeof AUTH_RESULT) => void = () => undefined;
        mockedRefreshAccessToken.mockReturnValueOnce(new Promise((resolve) => (resolveRefresh = resolve)));

        const { unmount } = renderHook(() => useSessionRefresh(undefined));
        unmount();
        resolveRefresh(AUTH_RESULT);
        await Promise.resolve();

        expect(location.reload).not.toHaveBeenCalled();
        expect(location.replace).not.toHaveBeenCalled();
    });

    it("does not act on a stale rejection after unmount", async () => {
        const location = mockLocation();
        let rejectRefresh: (reason: unknown) => void = () => undefined;
        mockedRefreshAccessToken.mockReturnValueOnce(new Promise((_resolve, reject) => (rejectRefresh = reject)));

        const { unmount } = renderHook(() => useSessionRefresh(undefined));
        unmount();
        rejectRefresh(new Error("no refresh token"));
        await Promise.resolve();
        await Promise.resolve();

        expect(location.reload).not.toHaveBeenCalled();
        expect(location.replace).not.toHaveBeenCalled();
    });
});

describe("useSessionRefresh — with userUid (already authenticated)", () => {
    it("does not attempt a refresh immediately", () => {
        renderHook(() => useSessionRefresh("u1"));
        expect(mockedRefreshAccessToken).not.toHaveBeenCalled();
    });

    it("refreshes on a recurring timer comfortably inside the 1-hour access token lifetime", async () => {
        vi.useFakeTimers();
        mockedRefreshAccessToken.mockResolvedValue(AUTH_RESULT);

        renderHook(() => useSessionRefresh("u1"));

        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(2);
    });

    it("redirects to sign-in immediately if a scheduled refresh is rejected as unauthorized (refresh token expired/revoked)", async () => {
        vi.useFakeTimers();
        const location = mockLocation();
        mockedRefreshAccessToken.mockRejectedValueOnce(new ApiRequestError("refresh token expired", 401));

        renderHook(() => useSessionRefresh("u1"));
        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
        await vi.waitFor(() => expect(location.replace).toHaveBeenCalledWith("/auth/signin"));
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it("retries instead of redirecting on a transient (non-auth) failure, and does not redirect once a retry succeeds", async () => {
        vi.useFakeTimers();
        const location = mockLocation();
        mockedRefreshAccessToken.mockRejectedValueOnce(new ApiRequestError("bad gateway", 502)).mockResolvedValueOnce(AUTH_RESULT);

        renderHook(() => useSessionRefresh("u1"));
        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);
        expect(location.replace).not.toHaveBeenCalled();

        // 30s retry backoff.
        await vi.advanceTimersByTimeAsync(30 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(2);
        expect(location.replace).not.toHaveBeenCalled();
    });

    it("redirects to sign-in once transient-failure retries are exhausted", async () => {
        vi.useFakeTimers();
        const location = mockLocation();
        mockedRefreshAccessToken.mockRejectedValue(new ApiRequestError("bad gateway", 502));

        renderHook(() => useSessionRefresh("u1"));
        await vi.advanceTimersByTimeAsync(55 * 60 * 1000); // initial attempt
        await vi.advanceTimersByTimeAsync(30 * 1000); // retry 1
        await vi.advanceTimersByTimeAsync(30 * 1000); // retry 2
        expect(location.replace).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(30 * 1000); // retry 3 — retries exhausted
        await vi.waitFor(() => expect(location.replace).toHaveBeenCalledWith("/auth/signin"));
    });

    it("does not redirect or schedule a retry for a stale rejection that arrives after unmount", async () => {
        vi.useFakeTimers();
        const location = mockLocation();
        let rejectRefresh: (reason: unknown) => void = () => undefined;
        mockedRefreshAccessToken.mockReturnValueOnce(new Promise((_resolve, reject) => (rejectRefresh = reject)));

        const { unmount } = renderHook(() => useSessionRefresh("u1"));
        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);

        unmount();
        rejectRefresh(new ApiRequestError("bad gateway", 502));
        await Promise.resolve();
        await Promise.resolve();

        // No redirect, and no retry scheduled off the back of the stale rejection.
        await vi.advanceTimersByTimeAsync(60 * 1000);
        expect(location.replace).not.toHaveBeenCalled();
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it("clears the timer on unmount, so no refresh fires afterward", async () => {
        vi.useFakeTimers();
        const { unmount } = renderHook(() => useSessionRefresh("u1"));

        unmount();
        await vi.advanceTimersByTimeAsync(55 * 60 * 1000);

        expect(mockedRefreshAccessToken).not.toHaveBeenCalled();
    });

    it("restarts the timer if userUid changes", async () => {
        vi.useFakeTimers();
        mockedRefreshAccessToken.mockResolvedValue(AUTH_RESULT);
        const { rerender } = renderHook(({ uid }: { uid: string }) => useSessionRefresh(uid), {
            initialProps: { uid: "u1" },
        });

        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        rerender({ uid: "u2" });
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        // The first timer was cleared on rerender before firing at 55 min, and the new one restarted its
        // own 55-minute countdown from the rerender — so only 30 of the required 55 minutes have elapsed.
        expect(mockedRefreshAccessToken).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(25 * 60 * 1000);
        expect(mockedRefreshAccessToken).toHaveBeenCalledTimes(1);
    });
});
