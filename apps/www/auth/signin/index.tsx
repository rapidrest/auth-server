import React from "react";

export default function SignInPage() {
    return (
        <div className="rr-page">
            <div className="rr-container">
                <div className="rr-brand">
                    <img src="/images/logo.svg" width="36" height="36" alt="" />
                    <span>RapidREST</span>
                </div>

                <div className="rr-card">
                    <div className="rr-card__title">Sign in</div>
                    <p className="rr-card__subtitle">
                        Password, passkey, authenticator app, and OAuth sign-in are coming soon.
                    </p>

                    <div className="rr-field">
                        <label htmlFor="identifier">Account ID, e-mail, or phone</label>
                        <input id="identifier" className="rr-input" type="text" disabled placeholder="you@example.com" />
                    </div>
                    <button className="rr-button rr-button--primary" type="button" disabled>
                        Continue
                    </button>

                    <div className="rr-divider">or</div>

                    <button className="rr-button rr-button--oauth" type="button" disabled style={{ marginBottom: "0.6rem" }}>
                        Continue with Google
                    </button>
                    <button className="rr-button rr-button--oauth" type="button" disabled>
                        Continue with Microsoft
                    </button>
                </div>

                <div className="rr-footer-link">
                    Don&rsquo;t have an account? <a href="/auth/signup">Create one</a>
                </div>
            </div>
        </div>
    );
}
