import React from "react";
import { AuthResult, setAuthToken } from "../../../shared/lib/api.js";
import AuthShell from "../../../shared/components/layout/AuthShell.js";
import SignInFlow from "../../../shared/components/sign-in/SignInFlow.js";

function completeSignIn(result: AuthResult) {
    setAuthToken(result.token);
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
