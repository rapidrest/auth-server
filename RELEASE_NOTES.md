# Release Notes

## v1.0.0

A reference implementation of a RapidREST authorization server built on [@rapidrest/auth](https://github.com/rapidrest/auth), [@rapidrest/service-core](https://github.com/rapidrest/service-core) and [@rapidrest/react](https://github.com/rapidrest/react), providing a complete, deployable authentication/account-management service plus a React front end and admin console.

### Authentication

* Sign-in and self-service registration flows
* Multi-factor authentication (MFA) — TOTP, one-time passwords (OTP), FIDO2/WebAuthn hardware keys, passkeys and recovery codes
* Sign-in with Apple, Facebook, Google and Microsoft via OAuth 2.0/OpenID Connect
* Step-up account elevation (`@RequiresElevation`) requiring re-verification before sensitive actions
* Secure, `HttpOnly` cookie-based session issuance

### Account Management

* Account registration and profile pages, including multiple aliases (e.g. email, phone, third-party OAuth ID)
* Change-password and secret (TOTP/Passkey/FIDO2) enrollment flows
* Self-service account deletion

### Admin Console

* A dedicated admin dashboard app for managing user accounts — list, create, view/edit detail, and delete
* Default account provisioning on startup via a configurable background job

### Data & Deployment

* MongoDB and SQL (via TypeORM) backends
* Docker and Docker Compose support (including dedicated Mongo/SQL/debug compose files)
* Helm chart for Kubernetes support
* Prometheus metrics, OpenAPI 3 spec generation
* k6 load test suites
