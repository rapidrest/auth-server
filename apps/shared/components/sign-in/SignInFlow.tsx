///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React, { FormEvent, useEffect, useState } from "react";
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import {
    ApiRequestError,
    AuthResult,
    beginMfaChallenge,
    completeOAuthSignIn,
    DiscoverResult,
    discoverAuthMethods,
    getFido2Challenge,
    getOAuthAuthorizeURL,
    getOtpChallenge,
    getPasskeyChallenge,
    isMfaChallenge,
    MfaChallenge,
    MfaMethod,
    signInWithOtp,
    signInWithPassword,
    signInWithTotp,
    verifyFido2SignIn,
    verifyMfaCode,
    verifyMfaFido2,
    verifyPasskeySignIn,
} from "../../lib/api.js";
import { guessIdentifierType } from "../../lib/identifier.js";
import { decodeOAuthState, encodeOAuthState } from "../../lib/oauthState.js";
import IdentifierStep from "./steps/IdentifierStep.js";
import MethodListStep from "./steps/MethodListStep.js";
import ChallengeStep from "./steps/ChallengeStep.js";
import MfaStep from "./steps/MfaStep.js";
import OAuthCallbackStep from "./steps/OAuthCallbackStep.js";
import { buildMethodList, EMPTY_DISCOVER, FixedMethod, Method, OtpHint, Step } from "./types.js";

export interface SignInFlowProps {
    /**
     * Called once sign-in completes successfully. The page renders this as "store the token and
     * navigate to /account"; a future pop-up usage would do something else instead (e.g. close itself)
     * — that's the whole reason this component doesn't do either of those things itself.
     *
     * `returnTo` is only given for an OAuth-provider sign-in that came back with one: the page's own query
     * string doesn't survive that round trip, so it's the value this component carried through the
     * provider's redirect in `state` (see `oauthState.ts`). It is untrusted, like any other return URL.
     */
    onSuccess: (result: AuthResult, returnTo?: string | null) => void;
    /**
     * Where the page wants the user sent after sign-in, if anywhere. Only used to carry it through an
     * OAuth-provider redirect, where it would otherwise be lost — see `onSuccess`. Every other sign-in
     * method completes without leaving the page, so the page can still read it for itself.
     */
    returnTo?: string | null;
    /**
     * The ids of the OAuth providers (`google`, `microsoft`, `apple`, `facebook`) to offer a "Continue with ..."
     * button for — the ones the server has real credentials for. Absent means every built-in provider.
     */
    oauthProviders?: string[];
}

/**
 * The sign-in step machine (identifier → methods → challenge). Renders only its `.rr-card` content —
 * no page chrome — so it can be dropped into a `Modal` for a pop-up sign-in with no changes.
 */
export default function SignInFlow({ onSuccess, returnTo, oauthProviders }: SignInFlowProps) {
    const [step, setStep] = useState<Step>("identifier");
    const [identifier, setIdentifier] = useState("");
    const [discoverLoading, setDiscoverLoading] = useState(false);
    const [discover, setDiscover] = useState<DiscoverResult>(EMPTY_DISCOVER);
    const [method, setMethod] = useState<Method | null>(null);
    const [selectedOtpHint, setSelectedOtpHint] = useState<OtpHint | null>(null);

    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [otpStep, setOtpStep] = useState<"contact" | "code">("contact");
    const [otpContact, setOtpContact] = useState("");
    const [otpCode, setOtpCode] = useState("");

    // Populated when signInWithPassword() resolves an MfaChallenge instead of a completed AuthResult —
    // see handlePasswordSubmit.
    const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
    const [mfaSelectedMethod, setMfaSelectedMethod] = useState<MfaMethod | null>(null);
    const [mfaFido2Options, setMfaFido2Options] = useState<PublicKeyCredentialRequestOptionsJSON | null>(null);
    const [mfaCode, setMfaCode] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Which provider's "Continue with ..." button is mid-flight, if any — drives that one button's
    // own loading spinner and disables the rest, via IdentifierStep's oauthLoadingProvider prop.
    const [oauthLoadingProvider, setOauthLoadingProvider] = useState<string | null>(null);

    const methodItems = buildMethodList(discover);

    // Picks up where handleOAuthSignIn left off: a provider's "Continue with ..." button does a real
    // top-level navigation away to /api/auth/<provider> and back (see that function's own comment for
    // why this can't be a fetch call), so the only way this component learns the attempt even happened
    // is by re-mounting with `code`/`state`/`error` back in the URL. Runs once, on mount, client-side
    // only (a server-rendered pass has no `window` to read either of those from).
    useEffect(() => {
        const search = window.location.search;
        const params = new URLSearchParams(search);
        if (!params.has("code") && !params.has("error")) {
            return;
        }

        // Scrub the one-time code/state out of the URL immediately so a page refresh (or the user
        // copying the link) can't replay it against an already-consumed authorization code.
        window.history.replaceState(null, "", window.location.pathname);

        const { provider, returnTo: recoveredReturnTo } = decodeOAuthState(params.get("state"));

        setStep("oauth");
        setError(null);

        if (!provider) {
            // No provider recoverable from `state` — e.g. it was stripped/mangled in transit, or the
            // provider errored out before ever including one. Nothing to forward this to; ask the
            // user to retry.
            setError("Sign-in could not be completed. Please try again.");
            return;
        }

        setLoading(true);
        completeOAuthSignIn(provider, search)
            .then((result) => onSuccess(result, recoveredReturnTo))
            .catch((err) => {
                setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
                setLoading(false);
            });
        // Deliberately empty: this is a one-time check of the URL this component mounted with, not a
        // reaction to any state/prop this effect would otherwise need to depend on.
    }, []);

    async function handleOAuthSignIn(provider: string) {
        // Fetches the authorization URL through the normal API/React error-handling path first,
        // rather than navigating the browser straight to a backend route that itself issues the
        // redirect — that would leave any failure (misconfiguration, a session that failed to start)
        // landing the browser on the API's raw response with no chance for this component to render
        // it. Only once a URL actually comes back does this do the real top-level navigation — the
        // browser has to actually follow the provider's own redirect chain from there (its
        // login/consent screens live on its domain, not ours), which a fetch response body alone
        // can't make it do.
        setError(null);
        setOauthLoadingProvider(provider);
        try {
            // Round-trips the provider name — and the page's `return_to`, which this navigation away and
            // back would otherwise lose — through the OAuth `state` param. See `oauthState.ts` for the
            // encoding and how `decodeOAuthState()` recovers it on the way back.
            const { url } = await getOAuthAuthorizeURL(provider, encodeOAuthState(provider, returnTo));
            window.location.href = url;
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
            setOauthLoadingProvider(null);
        }
    }

    async function handleIdentifierSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setDiscoverLoading(true);
        const trimmedIdentifier = identifier.trim();
        let result: DiscoverResult;
        try {
            result = await discoverAuthMethods(trimmedIdentifier);
        } catch (err) {
            setDiscoverLoading(false);
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
            return;
        }
        const items = buildMethodList(result);
        if (items.length === 0) {
            // No account recognizes this identifier — send the user to sign-up instead of a dead end. An
            // e-mail/phone-shaped identifier can skip straight to sign-up's verification step (they already
            // typed the contact value); anything else (e.g. a username attempt) can only start sign-up fresh.
            const guessedType = guessIdentifierType(trimmedIdentifier);
            window.location.href = guessedType
                ? `/auth/signup?${new URLSearchParams({ type: guessedType, id: trimmedIdentifier, autosend: "1" }).toString()}`
                : "/auth/signup";
            return;
        }
        setDiscover(result);
        setDiscoverLoading(false);
        if (items.length === 1) {
            // Nothing to choose between — skip the method-list step and go straight to the one method's
            // challenge. `onBack` from there returns to the identifier step instead of a one-item list.
            const only = items[0];
            if (only.kind === "fixed") {
                selectFixedMethod(only.method);
            } else {
                selectOtpMethod(only.hint);
            }
            return;
        }
        setStep("methods");
    }

    function goToIdentifier() {
        setStep("identifier");
        setError(null);
        setMethod(null);
        setSelectedOtpHint(null);
        setPassword("");
        setTotpCode("");
        setOtpStep("contact");
        setOtpContact("");
        setOtpCode("");
        setMfaChallenge(null);
        setMfaSelectedMethod(null);
        setMfaFido2Options(null);
        setMfaCode("");
    }

    function goToMethods() {
        setStep("methods");
        setError(null);
        setMethod(null);
        setSelectedOtpHint(null);
        setPassword("");
        setTotpCode("");
        setOtpStep("contact");
        setOtpContact("");
        setOtpCode("");
    }

    function backToMfaMethods() {
        setError(null);
        setMfaSelectedMethod(null);
        setMfaFido2Options(null);
        setMfaCode("");
    }

    function selectFixedMethod(m: FixedMethod) {
        setMethod(m);
        setSelectedOtpHint(null);
        setError(null);
        setStep("challenge");
    }

    function selectOtpMethod(hint: OtpHint) {
        setMethod("otp");
        setSelectedOtpHint(hint);
        setError(null);
        setStep("challenge");
    }

    async function handlePasswordSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithPassword(identifier.trim(), password);
            if (isMfaChallenge(result)) {
                setMfaChallenge(result);
                setStep("mfa");
                setLoading(false);
            } else {
                onSuccess(result);
            }
        } catch (err) {
            setError(
                err instanceof ApiRequestError ? "Incorrect account ID or password." : "Something went wrong. Please try again.",
            );
            setLoading(false);
        }
    }

    async function handleSelectMfaMethod(selected: MfaMethod) {
        // Only reachable via MfaStep's onSelectMethod, which only renders once mfaChallenge is set.
        const { uid } = mfaChallenge!;
        setError(null);
        setLoading(true);
        try {
            const challengeResult = await beginMfaChallenge(uid, selected.id);
            setMfaSelectedMethod(selected);
            if (selected.type === "fido2") {
                setMfaFido2Options(challengeResult);
            }
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleMfaCodeSubmit(e: FormEvent) {
        e.preventDefault();
        // Only reachable via MfaStep's onCodeSubmit, which only renders once mfaChallenge is set.
        const { uid } = mfaChallenge!;
        setError(null);
        setLoading(true);
        try {
            const result = await verifyMfaCode(uid, mfaCode.trim());
            onSuccess(result);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handleMfaFido2SignIn() {
        // Only reachable via MfaStep's onFido2SignIn, which only renders once mfaFido2Options is set
        // (handleSelectMfaMethod sets it before the fido2 challenge UI ever appears).
        const optionsJSON = mfaFido2Options!;
        setError(null);
        setLoading(true);
        try {
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyMfaFido2(response);
            onSuccess(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Hardware key sign-in was cancelled.");
            } else {
                setError(
                    err instanceof ApiRequestError ? "Hardware key sign-in failed." : "Something went wrong. Please try again.",
                );
            }
            setLoading(false);
        }
    }

    async function handleTotpSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithTotp(identifier.trim(), totpCode.trim());
            onSuccess(result);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handleOtpChallengeSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            // Only reachable via OtpChallenge's contact form, which only renders once an OTP hint is selected.
            // `channel` is undefined for a plain SMS/e-mail hint, so the request carries no `channel` for those.
            await getOtpChallenge(otpContact.trim(), selectedOtpHint!.channel);
            setOtpStep("code");
        } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleOtpVerifySubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const result = await signInWithOtp(otpContact.trim(), otpCode.trim());
            onSuccess(result);
        } catch (err) {
            setError(err instanceof ApiRequestError ? "Invalid or expired code." : "Something went wrong. Please try again.");
            setLoading(false);
        }
    }

    async function handlePasskeySignIn() {
        setError(null);
        setLoading(true);
        try {
            const optionsJSON = (await getPasskeyChallenge(identifier.trim())) as PublicKeyCredentialRequestOptionsJSON;
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyPasskeySignIn(response);
            onSuccess(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Passkey sign-in was cancelled.");
            } else {
                setError(err instanceof ApiRequestError ? "Passkey sign-in failed." : "Something went wrong. Please try again.");
            }
            setLoading(false);
        }
    }

    async function handleFido2SignIn() {
        setError(null);
        setLoading(true);
        try {
            const optionsJSON = (await getFido2Challenge(identifier.trim())) as PublicKeyCredentialRequestOptionsJSON;
            const response = await startAuthentication({ optionsJSON });
            const result = await verifyFido2SignIn(response);
            onSuccess(result);
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setError("Hardware key sign-in was cancelled.");
            } else {
                setError(
                    err instanceof ApiRequestError ? "Hardware key sign-in failed." : "Something went wrong. Please try again.",
                );
            }
            setLoading(false);
        }
    }

    return (
        <div className="rr-card">
            {step === "identifier" && (
                <IdentifierStep
                    identifier={identifier}
                    setIdentifier={setIdentifier}
                    discoverLoading={discoverLoading}
                    error={error}
                    onSubmit={handleIdentifierSubmit}
                    onOAuthSignIn={handleOAuthSignIn}
                    oauthLoadingProvider={oauthLoadingProvider}
                    oauthProviders={oauthProviders}
                />
            )}

            {step === "oauth" && <OAuthCallbackStep error={error} onBack={goToIdentifier} />}

            {step === "methods" && (
                <MethodListStep
                    identifier={identifier}
                    methodItems={methodItems}
                    onSelectFixed={selectFixedMethod}
                    onSelectOtp={selectOtpMethod}
                    onBack={goToIdentifier}
                />
            )}

            {step === "challenge" && method && (
                <ChallengeStep
                    method={method}
                    identifier={identifier}
                    selectedOtpHint={selectedOtpHint}
                    error={error}
                    loading={loading}
                    onBack={methodItems.length === 1 ? goToIdentifier : goToMethods}
                    backLabel={methodItems.length === 1 ? "Use a different account" : undefined}
                    password={password}
                    setPassword={setPassword}
                    onPasswordSubmit={handlePasswordSubmit}
                    totpCode={totpCode}
                    setTotpCode={setTotpCode}
                    onTotpSubmit={handleTotpSubmit}
                    otpStep={otpStep}
                    otpContact={otpContact}
                    setOtpContact={setOtpContact}
                    otpCode={otpCode}
                    setOtpCode={setOtpCode}
                    onOtpContactSubmit={handleOtpChallengeSubmit}
                    onOtpVerifySubmit={handleOtpVerifySubmit}
                    onOtpBackToContact={() => {
                        setOtpStep("contact");
                        setOtpCode("");
                        setError(null);
                    }}
                    onPasskeySignIn={handlePasskeySignIn}
                    onFido2SignIn={handleFido2SignIn}
                />
            )}

            {step === "mfa" && mfaChallenge && (
                <MfaStep
                    methods={mfaChallenge.methods}
                    selectedMethod={mfaSelectedMethod}
                    onSelectMethod={handleSelectMfaMethod}
                    onBackToMethods={backToMfaMethods}
                    onBack={goToIdentifier}
                    code={mfaCode}
                    setCode={setMfaCode}
                    onCodeSubmit={handleMfaCodeSubmit}
                    onFido2SignIn={handleMfaFido2SignIn}
                    loading={loading}
                    error={error}
                />
            )}
        </div>
    );
}
