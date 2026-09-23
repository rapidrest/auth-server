# Release Notes

## Unreleased

## v1.0.0-beta.19

## v1.0.0-beta.18

* Added **CSRF (double-submit cookie) protection**, on by default (`csrf:enabled`/`auth:csrf:enabled`
  config, both `true` in `config.sql.ts`/`config.mongo.ts`). Enforcement lives in
  `@rapidrest/service-core`'s `RouteUtils.checkCsrf()` and applies automatically to every mutating
  request whose only credential is the `jwt` cookie — a bearer-token/API-key caller is unaffected.
  `@rapidrest/auth`'s `TokenUtils`/`CsrfUtils` issue/rotate the cookie at login/refresh/elevation and
  clear it at logout. Needs `@rapidrest/auth` 2.0.0-beta.13 (or later) and `@rapidrest/service-core`
  2.3.0 (or later). Two frontend changes ship alongside it:
  * `apps/shared/lib/api.ts`'s `apiFetch()` now echoes the CSRF cookie back as an `x-csrf-token` header
    on every mutating request, same as `@rapidmx/react-shared`'s own `apiFetch()`/`authApiFetch()`.
  * `stopImpersonating()` now POSTs instead of GETs `/admin/impersonate/stop` — a state-changing GET is
    exploitable via a bare navigation, bypassing CSRF defenses entirely (they only ever apply to
    non-safe methods).

## v1.0.0-beta.17

* Added a durable, queryable **audit log** for security-relevant account activity — sign-ins (by method), registration, elevation, admin impersonation, account deletion, "log out everywhere", MFA enrolled/removed, password changed, and app-password created/removed/used. A new admin **Audit Log** page lists and filters every account's entries; each account's own detail page also shows its **Recent activity**. This replaces relying on `@rapidrest/core`'s `EventUtils` for anything audit-worthy — that mechanism is lossy, best-effort telemetry (with no `telemetry_services:url` configured, which is this app's default, it silently discards every event end to end) and was never meant for this. A write failure never blocks the action that triggered it — it's logged loudly instead — and nothing is ever purged unless `audit_log:retention_days` is explicitly set (unset means keep forever). Needs `@rapidrest/auth` 2.0.0-beta.11 or later

* Added **app passwords**: from the account page's new "App passwords" card, a user can create a separate,
  server-generated password for one app or device that can't respond to a two-factor prompt — an older e-mail
  client speaking HTTP Basic Auth to a downstream service (e.g. a mail server) that validates its credentials
  against this server's `/auth/basic`, for example. Unlike the account's real password, an app password
  authenticates there even when the account has `requireMFA` set — that's the entire point: a legacy client that
  can't do MFA gets its own high-entropy, individually revocable credential instead of the account's MFA being
  disabled to accommodate it. The plaintext is shown exactly once, at creation; only its hash is ever stored, and
  there's no way to rotate one in place — remove it and create a new one. New `auth:app_password:enabled` config
  (default `true`) turns the feature off deployment-wide: existing app passwords stop authenticating and new ones
  can't be created, but nothing is deleted. Needs `@rapidrest/auth` 2.0.0-beta.11 or later
* Every secret — password, app password, authenticator app, passkey, security key, and recovery codes —
  now tracks **when it was last used** to sign in, shown on the account page (and to an admin viewing an
  account's sign-in methods) as "Never used" until then. An admin's **Sign-in methods** card also now shows
  and can revoke app passwords and recovery codes, which it previously left out entirely

## v1.0.0-beta.16
* Fixed the Helm chart never setting `auth:passkey`/`auth:fido2`'s `rpID`/`origin`, so a deployment fell back to
  `@rapidrest/auth`'s built-in defaults (rpID `rapidrest`, origin `http://localhost:3000`) — neither of which matches a
  real domain. WebAuthn refuses even to start when the relying-party ID doesn't match the page's own domain, so every
  "Add a passkey"/"Add a security key" attempt failed instantly with a browser `SecurityError`, before any prompt ever
  appeared. Both now default to the server's own host/origin (`service-config.yaml`); `service.config` can still
  override either
* Fixed `PasskeySecretForm`/`Fido2SecretForm` showing only a generic "Could not add a passkey."/"Could not add a
  security key." for any browser-side WebAuthn failure (like the one above) — they now include the browser's own
  error name and message, e.g. `(SecurityError: ...)`
* Fixed the Helm chart's `service.config` being unable to actually override `cors__origins`, `trusted_proxies`,
  `NODE_ENV` or the new `auth__passkey__*`/`auth__fido2__*` keys above: setting any of them there previously produced
  a ConfigMap with the same key twice, which both `helm template` and `kubectl apply` refuse to render/apply at all

* Added a dark/light theme toggle to the user menu. The choice is remembered in the browser (`localStorage`, key `rr-theme`), applied before the page paints so there is no flash, and otherwise follows the operating system
* Added an "Exit Admin Console" item to the user menu inside the admin console, which goes to `/`
* Added a "Return to App" button beside "Log out" on `/account`, shown when the new `app_url` config is set to an absolute `http(s)` URL
* Added a "Change" button beside a password on the Sign-in methods card, which changes the password in place instead of making the user remove it and add it again (it asks for elevation the same way removing does)
* Text messages can now be sent through **Telnyx** as well as Twilio, one provider at a time, chosen on the admin Messages page (`@rapidrest/core` 6.0). Switching providers keeps the other provider's saved credentials, unused
* Added **WhatsApp** messaging (Meta's WhatsApp Business Cloud API): credentials on the admin Messages page, a WhatsApp message and approved-template editor on each template, and — with a release of `@rapidrest/auth` that includes it — WhatsApp as a way to receive a sign-in, second-factor or elevation code for a verified phone number
* Added the `site_settings` config, which pre-sets the site branding (`siteTitle`, `companyName`, `headerHtml`, `footerHtml`, `logoUrl`, `iconUrl`, `stylesheetUrl`) for a deployment. A new **Reset branding** button on the Site Settings page puts everything (including an uploaded logo/icon/stylesheet) back to what `site_settings` says right now — how a config change reaches a deployment whose branding was already seeded. It seeds the branding once — only fields still empty — after which the admin console owns it, so an admin's changes are never overwritten. A row that already exists keeps everything an admin saved. Because it seeds once, adding `site_settings` to a deployment whose branding has already been seeded has no effect; change it in the console
* **Breaking:** updated `@rapidrest/core` to 6.0, which reads SMS settings from `sms_config: { provider, config }` instead of the top-level `twilio` key. A deployment that has already started is unaffected (its Twilio credentials are in the database); a new one must set `sms_config__provider`, `sms_config__config__accountSid` and `sms_config__config__token`
* **Breaking:** the admin API for text-message settings moved from `/api/settings/twilio` to `/api/settings/sms`, which now takes and returns a `provider` and per-provider settings; `/api/settings/whatsapp` is new. Template edits gained `whatsapp`, `whatsappTemplateName`, `whatsappTemplateLanguage` and `whatsappTemplateParameters`
* Environment variables for config keep their case, so set `app_url`, `site_settings__siteTitle` and the like in lowercase; an uppercase `APP_URL` is not read
* Known limitation: an approved WhatsApp *authentication* template with a "copy code" button also needs the code as a button parameter, which `@rapidrest/core` does not send yet; a template whose body carries the code (a utility-style template) works

## v1.0.0-beta.15

* Added the `/auth/elevate?return_to=<url>` page, for a downstream app (on another origin under a shared cookie domain) whose API answered `api-104` (elevation required): it opens the elevation prompt for the signed-in user and, once they confirm, sends the browser to `return_to`, which is followed only if it is a same-origin path or an origin in `cors.origins`, otherwise `/account`. Cancelling the prompt goes to `/account` rather than back to `return_to`. With no session it sends the visitor to `/auth/signin` and back here after they sign in. The elevated token is issued as a cookie on `auth.cookie.access.domain`, so set that to the shared parent domain for the downstream app to see it

### Helm chart

* Fixed `cors__origins` in the `service-config` ConfigMap wrapping every origin in literal quote characters (`["\"https://app.example.com\""]`), which the server can't use: it sent no `Access-Control-Allow-Origin` header for any origin, so a downstream app's cross-origin calls (for example `POST /api/auth/logout`) were blocked, and it dropped every origin from the `return_to` allowlist, so a sign-in never returned to a downstream app. It is now `["https://app.example.com"]`

## v1.0.0-beta.14

* The sign-in page now only shows the Continue with Google, Microsoft, Apple and Facebook buttons for providers whose `auth.<provider>.clientID` has been changed from the shipped placeholder (e.g. `DEFAULT_MICROSOFT_CLIENT_ID`), since a button for a provider still on placeholder credentials can only end in that provider's error page; with none configured only the account ID / e-mail / phone form is shown

## v1.0.0-beta.13

* Added `nodemailer` to the dependencies: `@rapidrest/core`'s `MessagingUtils` loads it to send e-mail (sign-in and verification codes) but only lists it as a development dependency, so with `smtp_config` set every e-mail send failed with a missing module

### Helm chart

* Added `service.extraEnv`, extra environment variables for the server container, so an SMTP password (`smtp_config__auth__pass`) can come from a Secret instead of the `service.config` ConfigMap

## v1.0.0-beta.12

### Helm chart

* Fixed the cert-manager Issuer, which was mis-indented (`name` and `acme` at the wrong level) and shared one ACME account key Secret with a parent chart's own Issuer; the account key is now named after the Issuer
* Fixed the Certificate's `issuerRef`, which read `certmanager.*` (a nil-pointer failure) instead of `global.certmanager.*` and named a namespace cert-manager rejects
* Fixed `refreshInterval` in the ExternalSecrets, which read `externalSecrets.*` instead of `global.externalSecrets.*`
* Fixed the HTTPRoute of a Gateway the chart doesn't create: it now names no listener, so it attaches to every listener that accepts the host
* Added a ReferenceGrant so a Gateway in another namespace can read the certificate Secret when `global.gateway.name`/`global.gateway.namespace` point at one
* Fixed the vault-managed `service-secrets` ExternalSecret replacing the Secret the chart renders, which dropped `default_accounts` so the default admin account was never created; it now uses `creationPolicy: Merge`

### k3s_install.sh

* Fixed the script never finishing an install: it looked for a Gateway called `api-gateway` (the chart creates `<release>-gateway`), looked for its Envoy Service in the release's namespace (Envoy Gateway creates it in `envoy-gateway-system`) and waited for port 443 on that Service, which only exists once the certificate does, and the certificate is issued through the Service nginx forwards to after the wait
* Fixed `--tls false` being ignored, and the ACME account being registered with `admin@domain.local`, by passing `global.gateway.*` and `global.certmanager.email` (`--email`) to the chart, which doesn't read `gateway.*`
* Fixed nginx listening on IPv4 only, so Let's Encrypt and browsers that try IPv6 first for a host with an AAAA record couldn't connect
* Fixed the reverse proxy check treating Envoy's HTTP 400 (a PROXY protocol mismatch) as reachable
* Fixed the OpenBao unseal and the openbao-unsealer Deployment passing the key as `-`, which OpenBao takes literally
* Removed the `letsencrypt-prod` ClusterIssuer the script created and the chart never used, now that the chart issues its certificates from its own Issuer (`--email` is passed to it); an install that made one still has it removed by `--uninstall`, and cert-manager's webhook is waited for with a server-side dry run of an Issuer instead

## v1.0.0-beta.11

## v1.0.0-beta.10

## v1.0.0-beta.9

## v1.0.0-beta.8

* Added cert-manager issuer to helm chart

## v1.0.0-beta.7

* Added service-account to helm chart
* Fixed multiple issues with helm chart

## v1.0.0-beta.6

### Helm chart

* Disabled mongodb/postgres/redis auth by default
* Fixed multiple issues with building connection URLs for mongo/postgres

## v1.0.0-beta.5

### Helm chart

* Removing deprecated  db-redis-info secret from service deployment
* Adding `defaultAccounts` configuration to `values.yaml`.

## v1.0.0-beta.4

### Helm chart

* Significant restructuring of `values.yaml` file to be more compatible with other projects that use this as a dependency.
* Simplified database configuration. There is a now a simple toggle (`global.database.type`) to switch between the Mongo or SQL based backends.

## v1.0.0-beta.3

### Helm chart

* **OpenBao as the secret vault** (`global.openbao.enabled`, off in the chart, on in the install script): the JWT, cookie and session secrets live in
  OpenBao, and [External Secrets](https://external-secrets.io) copies them into the Kubernetes Secrets the pod loads. As
  a subchart of the RapidMX server the vault's coordinates come from that release (`global.openbao`), so both ends read
  one JWT secret. **OpenBao and External Secrets are prerequisites, like cert-manager - the chart installs neither.**
  `scripts/k3s_install.sh --openbao true` installs and initialises the vault, keeps its unseal key in a Secret with an
  unsealer Deployment that re-unseals it after any restart, writes each secret once, and creates the token the chart
  reads them with; the render fails with the command to run when External Secrets is missing. Point
  `global.openbao.address` at a vault you already run to use that one instead - with
  `global.openbao.auth.method=kubernetes` it authenticates with the pod's ServiceAccount and stores no token. The chart
  defaults the value to false, so a `helm install` that doesn't opt in behaves exactly as before.
* **Secrets are generated once and kept** rather than regenerated on every render: `cookies.secret`, `sessions.secret`
  and `auth.secret` default to empty and are stored in the release's own Secrets, so an upgrade no longer invalidates
  every cookie, session and issued token. `secrets.existingSecret` uses a Secret you manage instead, and rendering
  without cluster access (`helm template`, GitOps, `--dry-run`) fails rather than silently rotating them.
* **Deployment hardening ported from the RapidMX server chart:** non-root pod and container security contexts, startup
  and liveness probes, a graceful-shutdown preStop delay, checksum annotations that roll the pods when configuration or
  secrets change, and the client labels the bundled database NetworkPolicies expect.
* `service.trustedProxies` (`trusted_proxies`), so per-IP rate limits see the real client address behind the Gateway.
* **Breaking:** `environment` now defaults to `production` rather than `dev`.
* `host` may now be a template, rendered wherever the chart uses it (Gateway listeners, the certificate, CORS and the
  JWT claims), so a parent chart can drive it from its own values - e.g. the RapidMX server chart setting
  `authServer.host: 'auth.{{ .Values.global.domain }}'` from its `global.domain`. It defaults to
  `auth.<global.domain>`, i.e. `auth.localhost` when installed on its own.
* **Breaking:** `auth.audience` and `auth.issuer` default to that rendered host (`<host>` and `api.<host>`) rather than
  the raw `host` value. A deployment that kept the defaults keeps the same claims; one whose `host` is now a template
  gets the rendered name instead of the template text.

## v1.0.0-beta.2

A reference implementation of a RapidREST authorization server built on [@rapidrest/auth](https://github.com/rapidrest/auth), [@rapidrest/service-core](https://github.com/rapidrest/service-core) and [@rapidrest/react](https://github.com/rapidrest/react), providing a complete, deployable authentication/account-management service plus a React front end and admin console.

### Authentication

* Sign-in and self-service registration flows
* Multi-factor authentication (MFA) — TOTP, one-time passwords (OTP), FIDO2/WebAuthn hardware keys, passkeys and recovery codes
* Sign-in with Apple, Facebook, Google and Microsoft via OAuth 2.0/OpenID Connect
* Step-up account elevation (`@RequiresElevation`) requiring re-verification before sensitive actions
* Secure, `HttpOnly` cookie-based session issuance

### OAuth 2.0 / OpenID Connect Authorization Server

* Authorization code and refresh token grants, plus token introspection and revocation endpoints
* OIDC discovery, JWKS and UserInfo endpoints
* Hosted consent/authorize screen for third-party clients
* Admin-managed client registration — confidential and public clients, with secret regeneration/reveal

### Account Management

* Account registration and profile pages, including multiple aliases (e.g. email, phone, third-party OAuth ID)
* Change-password and secret (TOTP/Passkey/FIDO2) enrollment flows
* Self-service account deletion

### Admin Console

* A dedicated admin dashboard app for managing user accounts — search/filter, create, view/edit detail (roles, scopes, verification, MFA), and delete
* OAuth client management — create, view/edit, rotate secrets, and delete
* Site branding customization — logo, site title, custom header/footer HTML and stylesheet
* Admin impersonation of user accounts, with a persistent banner while impersonating
* Default account provisioning on startup via a configurable background job

### Data & Deployment

* MongoDB and SQL (via TypeORM) backends
* Docker and Docker Compose support (including dedicated Mongo/SQL/debug compose files)
* Helm chart for Kubernetes support
* Prometheus metrics, OpenAPI 3 spec generation
* k6 load test suites
