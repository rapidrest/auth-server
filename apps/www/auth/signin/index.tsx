///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import React from "react";
import AuthShell from "../../../shared/components/layout/AuthShell.js";
import SignInFlow from "../../../shared/components/sign-in/SignInFlow.js";

function completeSignIn() {
    window.location.href = "/account";
}

export default function SignInPage() {
    return (
        <AuthShell brand>
            <SignInFlow onSuccess={completeSignIn} />
            <div className="rr-footer-link">
                Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
            </div>
        </AuthShell>
    );
}
