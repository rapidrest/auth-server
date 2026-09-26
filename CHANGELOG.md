# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added automatic passkey sign-in: the sign-in page remembers the passkey most recently created or used on the device and asks the browser for exactly that one on arrival, without asking for a username first, falling back to the ordinary form when none is remembered, after signing out, on return from an OAuth provider, or without WebAuthn
- Added a "Sign in with a passkey" button that signs in with one of the browser's passkeys without a username
- Set `auth.passkey.residentKey` to `required` so new passkeys are discoverable
- Added client-side navigation to the sign-in, account and admin apps: moving between their pages no longer loads a new document, while every URL is still rendered on the server in full, by turning on `router` in both `ReactRoute`s (`wwwRoute`, `AdminConsoleRoute`) and in the Vite config

### Changed
- Upgraded @rapidrest/react to 2.0.0, and require `^2.0.0` in package.json
- Expect a router entry for each app in the Vite hydration entries test

### Fixed
- Fixed passkey sign-in failing with "Cannot get schema for 'ECDSASigValue' target" by deduplicating the @peculiar/* packages in yarn.lock, which had been resolved at two versions and installed as separate copies
- Fixed an automatic passkey attempt being turned away when it raced the page's other startup requests for the session holding its challenge, by asking once more with a fresh challenge

## [1.0.0-beta.23] - 2026-09-25

### Changed
- Restore 100% branch coverage of apps/www and apps/shared/components/admin by removing three null fallbacks that could never run, in Set password's additional-password path and the account page's forced password change, since each is only reachable once secrets and the user have loaded, and use the same non-null assertion SecretsCard uses for that case

## [1.0.0-beta.22] - 2026-09-25

### Changed
- Document that a downstream package's release bump level follows its upstream dependency's, minor for minor, patch for patch and major for major, in NOTES
- Let an administrator hand an account a temporary password: add "Allow the user to change their password" and "Require the user to change their password at first/next sign-in" options to the New user form and to Set password, a mandatory change-password dialog on /account for an account flagged passwordChangeRequired that has a Sign out button and needs no second prompt, and carry a safe return_to through it, following it only once the password has been changed Add a Generate button with Show/Hide and Copy for the password on the New user form and Set password Add the allowMultiplePasswords policy (auth.allowMultiplePasswords in config, off by default) with a switch under Settings, and an "Add as an additional password" option in Set password when several are allowed, so an administrator can keep a password of their own on an account; unticking "Allow the user to change their password" now revokes that right outright Clear a password's "Set by administrator" hint when its holder changes it, and restore it when an administrator resets it Retry a change-password once with the current version after an "Invalid object version" conflict, which signing in or elevating causes by stamping the secret's lastUsedAt Fix password sign-in failing with "Invalid authorization request" for a correct password when the browser had cached a stale uid for the identifier, as after a recreated development database, by forgetting it and retrying once with the plaintext Fix a custom logo being forced into a 128x128 square by fixing only its height Reorder the identifier types on the New user form Add tests for each and document the changes in the changelog and release notes
- Upgraded @rapidrest/auth dep

### Added
- Added the `allowMultiplePasswords` policy (`auth.allowMultiplePasswords` in config, off by default) with an admin console switch under Settings, stored in the database like `allowRegistration`: unless it's on, an account can have only one password
- Added an "Add as an additional password" option to the admin Set password dialog when multiple passwords are allowed, and made unticking "Allow the user to change their password" revoke that right (allowUserChange=false)
- Added "Allow the user to change their password" and "Require the user to change their password at first sign-in" options to the admin console's New user form, and a mandatory change-password dialog on /account for an account flagged `passwordChangeRequired`, with sign-in sending such an account there ahead of any return_to
- Added a Generate button (with Show/Hide and Copy) for the password on the New user form and Set password dialog, producing a random password that meets the server's requirements
- Added a Sign out button to the mandatory change-password dialog

### Fixed
- Fixed the "Set by administrator" label staying on a password its holder had since changed: it's now cleared with the change, and restored when an administrator resets the password
- Fixed a `return_to` being discarded when an account that must change its password signs in: it's carried to /account and followed once the password has been changed
- Fixed the change-password dialog failing with "Invalid object version" after a sign-in or elevation had bumped the password secret's version: it now retries once with the current version
- Fixed password sign-in failing with "Invalid authorization request" for a correct password when the browser had cached a stale account uid (e.g. after a recreated development database): a refused client-hashed attempt now forgets the cached uid and retries once with the plaintext
- Fixed a custom logo being forced into a 128x128 square on the sign-in and sign-up pages; only its height is fixed now, so a non-square logo keeps its aspect ratio
- Fixed a password set by an administrator being impossible for the account holder to change, by creating it with allowUserChange=true when permitted

## [1.0.0-beta.21] - 2026-09-24

### Added
- Added a test that runs the project's real Vite hydration plugin and asserts every page file under apps/www and apps/admin, nested and dynamic-segment ones included, has a client build entry, which fails against @rapidrest/react 1.1.0

### Changed
- Restore @rapidrest/react to ^2.0.0-beta.3, which an "Upgrading deps" pass had moved to ^1.1.0 because npm's latest tag is 1.1.0, since 1.x only treats a nested index.tsx as a page and so dropped signin, signup, authorize, elevate and the admin [uid] detail pages from the client build's manifest, making each answer 500
- Document the fix in the release notes

## [1.0.0-beta.20] - 2026-09-24

### Changed
- Switch MongoDB's Deployment to the Recreate update strategy, because with RollingUpdate on a single-writer PVC the replacement pod exits with code 100 while the old one holds the data lock and any change to MongoDB's pod spec deadlocks the helm upgrade
- Document both changes in the release notes

### Removed
- Removed every resource limit from the Helm chart, leaving only minimum requests: turn off Bitnami's resourcesPreset for the bundled MongoDB, Redis and PostgreSQL while keeping the requests the preset gave, because MongoDB's liveness probe was timing out at its 750m CPU cap and restarting the pod

## [1.0.0-beta.19] - 2026-09-23

_No notable changes._

## [1.0.0-beta.18] - 2026-09-23

### Added
- Added csrf and auth:csrf config defaults (both enabled) to config.sql.ts/config.mongo.ts, enabling CSRF (double-submit cookie) protection on every cookie-authenticated, state-changing request
- Added CSRF header echo (x-csrf-token) to apps/shared/lib/api.ts's apiFetch(), mirroring @rapidmx/react-shared's apiFetch()/authApiFetch()
- Added regression tests for each of the above and document the findings in NOTES.md

### Changed
- Upgraded deps
- Change stopImpersonating() from GET to POST, matching @rapidrest/auth's BaseImpersonationRoute fix - a state-changing GET is exploitable via a bare navigation, bypassing CSRF defenses entirely
- Update the doc comments in both ImpersonateRoute.ts wrappers to reflect the POST-only endpoint
- Document the changes in the README, CHANGELOG, release notes and NOTES
- Upgraded deps

### Added
- Added config defaults for `csrf` (top-level, enforcement) and `auth:csrf` (cookie rotation) to both `config.sql.ts`/`config.mongo.ts`, enabling CSRF (double-submit cookie) protection by default
- Added CSRF header echo (`x-csrf-token`) to `apps/shared/lib/api.ts`'s `apiFetch()`, mirroring `@rapidmx/react-shared`'s `apiFetch()`/`authApiFetch()`

### Changed
- Changed `stopImpersonating()` (`apps/shared/lib/api.ts`) from GET to POST, matching `@rapidrest/auth`'s `BaseImpersonationRoute` fix — a state-changing GET is exploitable via a bare navigation, bypassing CSRF defenses entirely
- Document the changes in the README, CHANGELOG, release notes and NOTES

## [1.0.0-beta.17] - 2026-09-22

### Added
- Added app passwords: a separate, server-generated password a user creates on the account page for an app or device that can't complete a two-factor prompt, shown once at creation, independently revocable, and immutable once created
- Added an auth:app_password:enabled config to turn app passwords off deployment-wide, and note it needs a release of @rapidrest/auth that includes the feature
- Added a last-used date to every secret, shown on the account page and to an admin viewing an account's sign-in methods, as Never used until the secret has authenticated a sign-in
- Added app passwords and recovery codes to the admin Sign-in methods card, which previously left both out, so an admin can now see and revoke either
- Added a durable, admin-queryable audit log for security-relevant account activity, separate from EventUtils, which is lossy telemetry and never meant for this: sign-ins by method, registration, elevation, impersonation, account deletion, sessions revoked, MFA changes, and app-password lifecycle
- Added AuditLogEntrySQL and AuditLogEntryMongo, append-only and deny-all like MessagingSettingsSQL, written only internally by BaseDatabaseAuditLogUtils
- Added GET /api/audit-log and GET /api/audit-log/:id, trusted-role-only and read-only, reusing the same filter and pagination query syntax GET /users already exposes
- Added an admin Audit Log page with filtering and pagination, and a Recent Activity card on each account's detail page linking to it
- Added an audit_log:retention_days config, unset by default so nothing is ever purged, and a daily background job that only purges when it is explicitly set
- Added junit.xml to gitignore

### Changed
- Document the changes in the README, CHANGELOG, release notes and NOTES
- Document the changes in the README, CHANGELOG, release notes and NOTES
- Upgraded auth dep

### Added
- Add app passwords: a separate, server-generated password a user creates for an app that can't complete a two-factor prompt, shown once at creation and independently revocable
- Add an auth:app_password:enabled config to turn app passwords off deployment-wide
- Add a last-used date to every secret, shown on the account page and to an admin viewing an account's sign-in methods
- Add app passwords and recovery codes to the admin Sign-in methods card, which previously left both out
- Add a durable, admin-visible audit log for sign-ins, registration, elevation, impersonation, account deletion, sessions-revoked, MFA changes and app-password lifecycle, with an optional retention policy

## [1.0.0-beta.16] - 2026-09-22

### Added
- Added Telnyx as an SMS provider alongside Twilio, chosen one at a time with sms_config.provider; switching keeps the other provider's saved credentials but leaves them unused
- Added a WhatsApp message and approved-template editor to each message template, sent through MessagingUtils.sendWhatsApp with a live preview
- Added a site_settings config that seeds the site branding once, the first time it's read; the admin console owns every field from then on, so an admin's edit or cleared field is never overwritten by a later config change
- Added a Reset branding button that puts every branding field, and any directly uploaded logo, icon or stylesheet, back to what site_settings says right now
- Added a dark/light theme toggle to the user menu, remembered in the browser and applied before the page paints so there is no flash
- Added an Exit Admin Console item to the admin console's user menu, which goes to /
- Added a Return to App button next to Log out on /account, shown when the new app_url config is set to an absolute http(s) URL
- Added a Change button beside a password on the Sign-in methods card, which changes the password in place instead of removing and re-adding it

### Changed
- Update @rapidrest/core to 6.0.0, moving SMS settings from the top-level twilio config key to sms_config, which names the provider and holds its own settings, and add whatsapp for WhatsApp Business Cloud API credentials
- Move the admin text-message settings API from /api/settings/twilio to /api/settings/sms and add /api/settings/whatsapp, with matching admin console cards
- Offer WhatsApp as a one-time-code delivery option for a verified phone number at sign-in, MFA and elevation, once @rapidrest/auth is upgraded to a release with WhatsApp OTP
- Document the changes in the README, CHANGELOG, release notes and NOTES
- Document the changes in the README, CHANGELOG, release notes and NOTES

### Fixed
- Fixed the Helm chart never setting auth:passkey/auth:fido2's rpID/origin for the deployment's own domain, which made every passkey or security key registration fail instantly with a browser SecurityError before any prompt appeared, by defaulting both to the server's own host and preferred scheme in service-config.yaml
- Fixed the passkey and security key forms showing only a generic failure message for a WebAuthn error, by including the browser's own error name and message
- Fixed the Helm chart's service.config being unable to actually override cors__origins, trusted_proxies, NODE_ENV or the new passkey/FIDO2 keys, which rendered a ConfigMap with a duplicate key that helm template and kubectl apply both refuse, by gathering every chart-derived default into one guarded loop

### Fixed
- Fix the Helm chart never setting a passkey/FIDO2 relying-party ID or origin for the deployment's own domain, which made every passkey or security key registration fail instantly with a browser SecurityError
- Fix the passkey and security key forms showing only a generic failure message instead of the browser's own WebAuthn error
- Fix the Helm chart's service.config being unable to actually override cors__origins, trusted_proxies, NODE_ENV or the passkey/FIDO2 keys, which previously rendered an invalid ConfigMap with a duplicate key

### Added
- Add a dark/light theme toggle to the user menu, remembered in the browser and applied before first paint
- Add an Exit Admin Console item to the admin console's user menu
- Add a Return to App button to /account that goes to the URL set in the app_url config
- Add a Change button for a password on the Sign-in methods card, which changes it in place
- Add Telnyx as an SMS provider alongside Twilio, chosen one at a time on the admin Messages page
- Add WhatsApp messaging: credentials and template editing in the admin console, and WhatsApp as a one-time-code option for a verified phone number
- Add a site_settings config that seeds the site branding once, after which the admin console owns it
- Add a Reset branding button that puts the site branding back to what site_settings says right now

### Changed
- Update @rapidrest/core to 6.0, moving the SMS config from twilio to sms_config with a provider and its settings
- Move the admin text-message settings API from /api/settings/twilio to /api/settings/sms

## [1.0.0-beta.15] - 2026-09-20

### Added
- Added an /auth/elevate page that asks a signed in user to confirm it's them and sends them back to a return_to on a trusted origin, or to /account when cancelled, so a downstream app can ask for an elevated token

### Changed
- Send a visitor with no session to sign in first, and back to the elevate page afterwards
- Test the rendered origins against the trusted origin list, and the elevate page
- Document the changes in the README, CHANGELOG, release notes and NOTES

### Fixed
- Fixed the chart writing every cors origin wrapped in literal quote characters, which left the server sending no Access-Control-Allow-Origin header and ignoring every return_to to another origin, by writing each origin once

### Added
- Add an /auth/elevate?return_to=<url> page that lets a downstream app on another origin send a signed-in user through the elevation prompt and back with an elevated token, going to /account instead when the prompt is cancelled or the return_to is not a same-origin path or a configured cors origin, and to sign-in and back here when there is no session
- Add an optional sign-in URL argument to useSessionRefresh
- Add a test that renders the Helm chart's cors__origins and checks it is a plain JSON list of origins the server accepts

### Fixed
- Fix the Helm chart's cors__origins holding every origin wrapped in literal quote characters, which made the server send no Access-Control-Allow-Origin header and ignore every return_to after sign-in, by no longer quoting each origin before the list is serialized

## [1.0.0-beta.14] - 2026-09-20

### Added
- Added tests for the enabled provider list, the sql and mongo wwwRoute props and the sign-in page buttons

### Changed
- Hide the sign-in page's Continue with Google, Microsoft, Apple and Facebook buttons until that provider's clientID has been replaced from its shipped placeholder in the config, by sending the ids of the configured providers to the page as oauthProviders
- Hide the or divider on the sign-in page when no OAuth provider is configured
- Document the change in the README, CHANGELOG, release notes and NOTES

### Changed
- Hide the Continue with Google, Microsoft, Apple and Facebook buttons on the sign-in page until that provider's clientID has been replaced from its shipped placeholder in the config, and the or divider too when none remain

## [1.0.0-beta.13] - 2026-09-20

### Added
- Added a return_to query parameter to the sign-in page that redirects to a same-origin path, or to an absolute URL whose origin is listed in cors.origins, once sign-in succeeds
- Added default e-mail and SMS templates for login-otp, verify-contact-otp and register-otp to the sql and mongo configs, which had none so no one-time code was ever delivered
- Added a larger logo option to the custom header and use it on the account page to render the logo twice as large
- Added nodemailer to the dependencies, which @rapidrest/core's MessagingUtils loads to send e-mail but only lists as a development dependency, so with smtp_config set every e-mail send failed with a missing module
- Added service.extraEnv to the helm chart so an SMTP password can come from a Secret instead of the service.config ConfigMap
- Added editing of the e-mail and SMS templates from a new Messages page in the admin console, stored in the database so a wording change needs no redeploy, with a live preview and a per-part revert to the default
- Added the site branding to every message as a brand variable and use it in the default templates, showing the logo, or the name without one, in a new HTML e-mail body
- Added editing of the SMTP server, Twilio credentials and the address or number messages are sent from in the admin console, encrypting the SMTP password and Twilio token at rest and never returning them
- Added seeding of those settings from the deployment's config the first time they are read, after which the database is the source of truth and a change takes effect on the next message without a restart
- Added a Reset to configuration button to the SMTP and Twilio cards that overwrites that card's settings with what the config says
- Added twilio dep

### Changed
- Carry return_to through an OAuth provider sign-in in the OAuth state, so it is no longer lost when the browser leaves for the provider and comes back
- Require a valid authenticator app code before an authenticator app secret is added as a sign-in method, discarding the unproven secret when the setup is abandoned
- Document the auth cookie domain option in the sql and mongo configs
- Document the return_to, authenticator app verification, cookie domain and message template decisions in NOTES
- Document the changes in the release notes
- Document the messaging design and decisions in NOTES and the admin console feature in the README
- Upgraded auth dep

### Fixed
- Fixed the admin console rendering the custom header, which is meant for the public pages
- Fixed the sign-in, sign-up and authorize pages showing the same logo twice by not rendering the custom header alongside the brand block
- Fixed the brand block showing the title beside a configured logo, so the title is only shown when no logo is configured
- Fixed every one-time code message never being sent because the server had no templates configured, by adding defaults for login-otp, verify-contact-otp and register-otp to the sql and mongo configs
- Fixed the header and footer settings card describing the header as shown on every page

## [1.0.0-beta.12] - 2026-09-20

### Added
- Added a ReferenceGrant to the helm chart so a Gateway in another namespace can read the certificate Secret with global.gateway.namespace set

### Changed
- Attach the helm chart's HTTPRoute to every listener of a Gateway it doesn't create that accepts the host, rather than to a listener named http
- Document the helm chart fixes in the release notes
- Document the fix in the release notes
- Stop k3s_install.sh waiting for port 443 on the Gateway's Service, which only exists once the certificate does, and that is issued through the Service nginx forwards to after the wait, and forward 443 whenever TLS is on for a public host
- Listen on IPv6 in the nginx stream proxy when the host has it, fail the reverse proxy check on the HTTP 400 Envoy answers a PROXY protocol mismatch with, and pass the OpenBao unseal key as an argument since bao refuses "-"
- Document the fixes in the release notes and NOTES

### Fixed
- Fixed the cert-manager Issuer in the helm chart, which was mis-indented and shared its ACME account key Secret with a parent chart's Issuer, so the key is now named after the Issuer
- Fixed the helm chart's Certificate reading certmanager.* instead of global.certmanager.*, which failed with a nil pointer, and drop the namespace from its issuerRef, which cert-manager rejects
- Fixed the helm chart's ExternalSecrets reading externalSecrets.refreshInterval instead of global.externalSecrets.refreshInterval
- Fixed the helm chart's vault-managed service-secrets ExternalSecret replacing the Secret the chart renders, which dropped default_accounts so the default admin account was never created, by merging its keys into that Secret with creationPolicy Merge
- Fixed k3s_install.sh never finishing an install by looking for the Gateway the chart creates, <release>-gateway rather than api-gateway, and its Envoy Service in envoy-gateway-system rather than the release's namespace
- Fixed --tls false being ignored and the ACME account registering as admin@domain.local by passing global.gateway.* and global.certmanager.email to the chart, which doesn't read gateway.*

### Removed
- Removed the letsencrypt-prod ClusterIssuer k3s_install.sh created and the chart never used, waiting for cert-manager's webhook with a server-side dry run of an Issuer instead, and keep --uninstall removing one an earlier version made

## [1.0.0-beta.11] - 2026-09-19

### Changed
- Changing default storage class name for helm chart

### Fixed
- Fixed error in helm datastore config

## [1.0.0-beta.10] - 2026-09-18

### Changed
- Changing helm chart certmanager to be global

## [1.0.0-beta.9] - 2026-09-18

### Changed
- Updated @rapidrest/cli dep
- Changed helm chart gateway to be scoped to this chart

## [1.0.0-beta.8] - 2026-09-18

### Added
- Added cert-manager issuer to helm chart

## [1.0.0-beta.7] - 2026-09-18

### Added
- Added service-account to helm chart

### Changed
- Renaming helm 'auth-server' helpers to 'rrst'
- Re-organizing helpers file
- Cleaning up syntax for helm helpers file to be more readable

### Fixed
- Fixed helm datastore configuration

## [1.0.0-beta.6] - 2026-09-18

### Changed
- Disabling mongo/postgres/redis auth by default

### Fixed
- Fixed multiple issues with mongo/postgres URL building
- Fixed acl URL

## [1.0.0-beta.5] - 2026-09-18

### Added
- Added defaultAccounts generation

### Fixed
- Fixed syntax error in helm notes

### Removed
- Removed deprecated  db-redis-info secret from service deployment

## [1.0.0-beta.4] - 2026-09-18

### Changed
- Major refactor to helm chart

## [1.0.0-beta.3] - 2026-09-17

### Added
- Added service.trustedProxies so per-IP rate limits see the real client address behind the Gateway, and default environment to production
- Added a runtime-togglable system settings route for registration and MFA policy, and give the admin console a dedicated icon sidebar with an avatar menu
- Added a new apps/shared/lib/systemSettings.ts client module and a RegistrationCard with both an "Allow new user registration" and a "Require multi-factor authentication" toggle, the latter only shown when the caller's token actually carries it (the admin trusted role or the system scope). Replace the admin console's inline nav links with a narrow icon sidebar (Users/OAuth Clients/Settings) and move Sign Out into a top-right avatar menu showing the caller's display name, and expand the shell to fill the viewport.

### Changed
- Changed helm chart to allow for templatized values for `host`, `auth.audience` and `auth.issuer`
- Port the RapidMX server's installer into scripts/k3s_install.sh: Envoy Gateway with a ClusterIP Service behind an nginx stream proxy that speaks the PROXY protocol, cert-manager installed before the chart, state-tracked firewall rules an --uninstall can undo, and --domain with the auth-server defaulting to auth.<domain>
- Render `host` as a template wherever the chart uses it and default it to auth.<global.domain>, so a parent chart can drive it from its own values, and derive auth.audience and auth.issuer from the rendered host
- Generate the JWT, cookie and session secrets once and read them back on upgrades from the release's own Secrets, so an upgrade no longer invalidates every issued token, cookie and session, and fail the render without cluster access rather than rotating them silently
- Harden the deployment the way the server's chart is: non-root pod and container security contexts, startup and liveness probes, a graceful-shutdown preStop delay, checksum annotations that roll the pods when configuration or secrets change, and the client labels the bundled database NetworkPolicies expect
- Keep the deployment's secrets in OpenBao when global.openbao.enabled, with External Secrets copying them into the Kubernetes Secrets the pod loads, reading the RapidMX server's vault when installed as its subchart so both ends sign and verify with one JWT secret
- Expect OpenBao in the cluster like cert-manager instead of bundling it, defaulting global.openbao.enabled to false so a plain helm install assumes no vault, and install it from scripts/k3s_install.sh behind --openbao (on by default), which initialises it, keeps the unseal key in a Secret with an unsealer Deployment that unseals it again after a restart, seeds this release's secrets once and mints the token External Secrets reads them with
- Document all of it in the README and release notes
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Mount a new /api/settings route (BaseSettingsRouteSQL/Mongo from @rapidrest/auth) separate from the existing branding settings, which move to /api/settings/branding to free up the path. GET is public so apps/www can render its own chrome; PUT is trusted-role-only. Registration can be closed at runtime and takes effect immediately across every path that creates a User: direct creation, the OTP registration flow, and a first-time OAuth sign-in (Google/Apple/Facebook/Microsoft) all now consult the stored setting instead of only the static config. Fix the SQL SiteSettingsRoute, which still mounted at the old /settings path and would have collided with the new route. Fix AuthMFARoute in both trees, which read a stale auth:require_mfa config key left over from the library's rename to auth:requireMFA. Wire allowRegistration into apps/www's sign-up (shows a closed message instead of the form) and sign-in (hides the "Create one" link) pages via a new SystemSettingsSSR helper feeding wwwRoute/AdminConsoleRoute's SSR props, alongside the existing branding settings.
- Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
- Upgraded @rapidrest/auth dep
- Moving system settings to top of page

## [1.0.0-beta.2] - 2026-09-15

### Added
- Added configurable gateway configuration to helm chart

### Changed
- Upgraded service-core and react deps

### Fixed
- Fixed issues with TLS setup in helm chart

## [1.0.0-beta.1] - 2026-09-10

### Added
- Added nav icon branding, dynamic favicon, and server-rendered site branding

### Changed
- Hash passwords client-side (Argon2id) before they leave the browser
- @rapidrest/auth 2.0.0-beta.7 added support for accepting an already
- client-hashed password alongside plaintext, distinguished by shape. Make
- the frontend a capable client for every password flow (sign-in, sign-up,
- account settings, admin create/set-password, elevation), so the real
- password never has to reach the server when this browser supports it.
- Uses @noble/hashes' pure-JS argon2idAsync (verified byte-identical to the
- server's argon2 binding) with the library's fixed client params and a
- uid-derived salt. Falls back to plaintext wherever the uid needed to
- derive that salt isn't yet known (first-ever sign-in from a browser) or
- hashing fails for any reason — functionally unchanged from today, since
- the server accepts either form.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Splits the single "logo" asset into a full logo (sign-in/sign-up/consent
- pages) and a separate, independently configurable "icon" for compact
- nav-header use (admin console nav, the / splash screen) — mirrors the
- existing logo upload/URL/delete plumbing end to end: models, upload
- endpoints, admin UI, and consumers.
- Also makes branding (title, favicon, logo/icon, header/footer HTML,
- custom stylesheet) render correctly on the very first byte of the
- response instead of flashing in after a client-side fetch, and be
- visible to crawlers reading the raw HTML. This relies on @rapidrest/react
- 2.0.0-beta.2, which now spreads a route's fetchProps() onto _layout.tsx
- as well as the page component; wwwRoute/AdminConsoleRoute (both SQL and
- Mongo) add one fetchProps() override each to feed current site settings
- into that pipeline.
- Also fixes six backend integration test fixtures (SiteSettingsRoute,
- OAuthIntegration, DefaultAccounts — both datastores) that were hashing
- passwords directly instead of through @rapidrest/auth's
- normalizePasswordSubmission(), left broken by the earlier auth library
- upgrade and only surfaced by running the full test suite for this change.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

### Removed
- Removed unused files

## [1.0.0-beta.0] - 2026-09-10

### Added
- Added mongo/sql specific test run scripts and CI stages
- Added missing deps
- Added test files
- Added default routes
- Added badges to readme
- Added account registration flow
- Added exports for model classes. This fixes a discoverability issue
- Added sign-in page
- Added logout support
- Added test suites for React frontend
- Added contact/alias verification flow
- Added hint to secret creation
- Added icons
- Added new admin dashboard
- Added AccountsRoute
- Added DefaultAccounts background job
- Added delete account button to account header
- Added list of aliases to user table
- Added flow for creation of secondfactor secrets when MFA is required on an account
- Added AuthElevationRoute
- Added @RequiresElevation to AdminConsoleRoute
- Added contributing guide
- Added Contact now offers a "Use this contact to sign in once verified"
- Added k6 tests
- Added postgresql suppor to Helm chart
- Added icons for oauth providers
- Added changelog and new release script
- Added back single_node_install.sh script
- Added config.ts so that project works from rapirest CLI
- Added `base_path` config variable for specifying the base path to pass to `Server`
- Added missing react.manifestPath config variable
- Added auth:oauth_server config block and production secret guard
- Added OAuthDiscoveryRoute endpoint-building tests
- Added admin console CRUD UI for OAuth Clients
- Added OAuth Clients nav link to AdminShell
- Added public /authorize consent screen
- Added returnTo support to sign-in with open-redirect guard
- Added oauthFetch helper for bare-path OAuth endpoints
- Added real end-to-end OAuth integration tests (sql/mongo)
- Added exists() to the shared FakeRedis test helper
- Added admin user impersonation UI: impersonate/stop buttons and a persistent warning banner
- Added an Impersonate action to the user list and detail admin pages
- Added a fixed, always-visible warning bar (AdminShell/AuthShell) with a Stop impersonating button while a session is impersonated, tracked via a client-side marker since the jwt_impersonator cookie is HttpOnly
- Added site customization settings (logo, title, header/footer, custom stylesheet) editable via a new admin console page
- Added SiteSettingsSQL/SiteSettingsMongo entities and BaseSiteSettingsRoute with public reads and trusted-role-gated writes for text fields and direct file uploads
- Added BrandingCard, ContentCard, and StylesheetCard admin components and the /admin/settings page, linked from AdminShell's nav
- Added support for @rapidrest/react's new nested non-index pages and dynamic [id].tsx route segments
- Added a gateway.create toggle (default true) so a parent chart can suppress this chart's own Gateway creation while still pointing its chart-qualified HTTPRoute at the parent's own shared Gateway
- Added persistent mongo_data/postgres_data volumes to docker-compose.mongo.yml/sql.yml, previously fully ephemeral

### Changed
- Initial commit
- Updated package description
- Upgraded deps
- Upgraded @rapidrest/react
- Upgraded @rapidrest/react to v0.10.0
- Updated site styling
- Mongo is now the default mode
- Implementing full sign-in flow
- Implementing account page
- Refactored account page UX
- Upgraded deps
- Updated code coverage thresholds
- Refactored how sign-in flow works
- Refactored all React pages into separate components
- Swapped drop-down on 'add contact' component to button selector
- Updated UX labels
- Updated fido2 label
- Entering an ID with no available sign-in methods now redirects to sign-up page.
- Moving all React components and lib to new 'shared' directory that can be shared between multiple react apps
- Initial commit for admin console app
- Upgraded auth library
- Refactored account page to use new unified `GET /api/accounts/:id` endpoint
- Updated tests
- Sign-in skips challenge method selection when only one is available
- Upgraded @rapidrest/auth
- Client API no longer stores the JWT token in local storage, instead relying purely on the provided session cookie for auth (sec fix).
- A server start that is not configured to override sensitive defaults (COOKIE_SECRET, AUTH_SECRET, SESSION_SECRET) now fails in 'production' mode
- Implementing support for MFA
- Implementing refresh tokens
- Refactored change password to use new 'update' endpoint for secrets
- Refactored secret creation flow to consolidate to a single action/step
- Upgraded core/service-core/auth deps
- Implementing user elevation
- Upgraded @rapidrest/auth
- Upgraded to @rapidrest/auth rc.20
- Renaming contributors file
- Upgraded project deps
- Converted existing tests from ioredis-mock to redis
- Converted sqlite to better-sqlite
- Upgraded @rapidrest/react dep
- server.ts mutated the shared auth config object in place when building an
- internal telemetry token's config, silently stripping expiresIn from every
- access token the server issues (nconf's config.get() returns live nested
- references, not clones) - now clones before mutating.
- Also addresses the remaining findings from a full adversarial security/
- correctness/performance review: /metrics defaulted to unauthenticated,
- OIDC placeholder credentials weren't covered by the production-secrets
- startup guard, the cookie `secure` comment contradicted actual behavior,
- trusted_proxies wasn't documented as a configurable knob, the session
- refresh hook force-logged-out users on any transient network failure, and
- profile, which could orphan a working credential on partial failure.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Auto-enable sign-in when a newly added contact is verified
- checkbox, checked by default. When a contact added through that flow is
- successfully verified, ContactsCard automatically creates the matching
- sign-in alias instead of requiring a separate manual "Enable" click
- afterward. Re-verifying an existing contact via its own standalone
- "Verify" action is unaffected - the auto-enable only applies to the
- create-then-verify flow.
- Also fixes an unrelated lint violation (typescript/no-empty-function) in
- test/config.defaults.test.ts left over from the previous commit.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- - AuthMFARoute.ts (mongo+sql): the `if (strategy)` false branch was
- unreachable through the existing Server integration tests, since the base
- class's initialize() always registers the "mfa" strategy when it doesn't
- throw. Added dedicated unit tests that stub out the base class's
- initialize() so both branches of the route's own logic can be driven
- directly, without a live database.
- - PasswordSecretForm/TotpSecretForm/Fido2SecretForm/PasskeySecretForm: the
- Confirm-step's non-ApiRequestError error branch, and the secrets-list map's
- "leave other secrets unchanged" branch, were both untested. Added six new
- account.test.tsx cases (two per form) covering them.
- - admin/users/detail/index.tsx: readTargetUid()'s `typeof window ===
- "undefined"` guard was never actually exercised despite a dedicated SSR
- test file existing for it - AdminShell renders only its own "checking"
- placeholder during SSR and never mounts children, so the guard was dead
- code in the real page tree. Exported the function and call it directly in
- the SSR test to exercise the branch, and corrected that file's comment
- which had incorrectly claimed the branch was already covered.
- Full suite: 537/537 passing, coverage 100% statements/branches/functions/lines.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Updated @rapidrest/service-core
- Docker image now runs in unprivileged user mode
- Initial pass on apple/facebook/google/microsoft oauth support
- Refactored oauth flows to redirect to react instead of API
- Upgraded @rapidrest/auth
- Upgraded @rapidrest/auth
- Frontend now retrieves authorization URL from API for oauth providers before redirecting
- Migrating license from MIT to MPLv2
- Changing oauth sign-in to use new `no_redirect` query param instead of dedicated endpoint
- Updated readme, release notes
- Updated readme, release notes
- Updated server.ts to use config.ts instead of dynamic switch
- Refactored packge scripts to use rapidrest CLI
- Upgraded @rapidrest/cli dep
- Upgraded all deps to latest
- Upgraded @rapidrest/cli
- Upgraded dep @rapidrest/cli
- Bump @rapidrest/auth to 2.0.0-beta.2
- Wire OAuth 2.0/OIDC authorization server routes into SQL/Mongo trees
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Move OAuthClientRoute under /api for apiFetch/elevation support
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Bump @rapidrest/core to 5.2.0 for the asymmetric-key JWT signing fix
- Use Client.uid instead of clientId, matching the upstream auth refactor
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Updated commit message instructions for Claude
- Upgraded @rapidrest/auth dep
- Upgraded @rapidrest/react dep
- Bump @rapidrest/auth to 2.0.0-beta.3, which now includes the clientId removal
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Wire up @rapidrest/auth's impersonation routes at POST/GET /admin/impersonate(/stop)
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Updated @rapidrest/auth dep
- Upgraded all dependencies
- Updated commit instructions for Claude
- Update AdminShell and AuthShell to render this deployment's logo, title, header/footer HTML, and custom stylesheet via a new useSiteSettings hook
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Upgraded @rapidrest/react  dep
- Flatten folder+index.tsx pages with no other reason to be nested: oauth-clients/new, users/new, settings, www/account, www/auth/authorize, www/auth/signin, www/auth/signup
- Convert the oauth-clients and users admin detail pages to dynamic [uid].tsx routes, replacing the old ?uid= query-string workaround and its readTargetUid()/SSR-guard code
- Update every internal link and redirect that built the old /detail?uid=X URLs to build /X instead
- Update NOTES.md with the routing-convention writeup and the decision to keep admin/oauth-clients/index.tsx nested rather than flattened
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Upgraded @rapidrest/service-core dep
- Tweaking branding layout
- Upgraded @rapidrest/react
- Chart-name-qualify jwt-auth/service-config/service-db-info resource names instead of hardcoding them, so a parent chart depending on this one as a subchart doesn't have its own resources of the same kind collide under the same literal name
- Update service.yaml's envFrom to match the renamed configmap/secret names
- Admin _layout's <title> passed React an array of children instead of a
- string, leaving the title empty. AuthShell was missing its wordmark span
- entirely, and AdminShell computed brandTitle but never used it, hardcoding
- "Admin Console" instead. Also moves execArgv out of the removed
- test.poolOptions.forks nesting to the top-level test option per the
- Vitest 4 migration guide.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Moving single_node_install.sh script to scripts/k3s_install.sh
- Document the OAuth 2.0/OIDC authorization server and admin console features in README/RELEASE_NOTES
- The feature lists hadn't been updated since the OAuth authorization server
- (authorize/token/introspect/revoke/jwks/userinfo/discovery), admin OAuth
- client management, site branding customization, and admin impersonation
- were added, so they no longer reflected what the project actually does.
- Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
- Updated single node cluster info in readme
- Pin better-sqlite3 to ^12.11.1, fixing a version mismatch against TypeORM's own peer range that made the production Docker image fail to build entirely
- Chown /app to the node user in the Dockerfile, fixing DefaultAccountsMongo's initial-admin-password bootstrap failing with EACCES since the non-root node user could never write a new file directly into /app
- Updated all CI workflow actions to use Node24

### Fixed
- Fixed issue with mongo detection
- Fixed issue with docker sql configuration
- Fixed route paths
- Fixed test-run CI commands
- Fixed test runs scripts
- Fixed issue with www app base path
- Fixed docker debug command
- Fixed react binding issues in docker
- Fixed tests for latest changes
- Fixed issue with sql DefaultAccounts test that causes sqlite database to lose state in the middle of a test
- Fixed elevation prompt functionality
- Fixed issue with password verification test of DefaultAccounts
- Fixed critical non-expiring JWT bug and other adversarial review findings
- Fixed several bugs with helm chart
- Fixed linter errors
- Fixed base_path resolution
- Fixed duplicate imports in config.mongo.ts and config.sql.ts
- Fixed linter error in config.ts
- Fixed build broken by an automated dep-bump that reverted @rapidrest/auth to 1.3.0
- Fixed unit tests
- Fixed apiFetch to preserve a caller-supplied Content-Type header instead of always overriding it with application/json, needed for raw file uploads
- Fixed CI build job
- Fixed CI build job
- Fixed CI test job
- Fixed failing frontend layout/shell tests and vitest.config poolOptions deprecation
- Fixed docker-compose.mongo.yml/sql.yml and the Helm chart's service.yaml always running the image's Mongo-hardwired default command regardless of environment or which datastore was enabled
- Fixed test run test scripts
- Fixed volume mount for postgres

### Removed
- Removed a contact deleted its sign-in alias after (not before) saving the
- Removed env var overrides in docker compose files that are no longer required
- Removed confirmation prompt when click Impersonate
- Removed test from .dockerignore, fixing yarn build's lint step failing outright when the build context is missing the test directory its tsconfig.eslint.json requires

[Unreleased]: github/auth-server/compare/v1.0.0-beta.23...HEAD
[1.0.0-beta.23]: github/auth-server/compare/v1.0.0-beta.22...v1.0.0-beta.23
[1.0.0-beta.22]: github/auth-server/compare/v1.0.0-beta.21...v1.0.0-beta.22
[1.0.0-beta.21]: github/auth-server/compare/v1.0.0-beta.20...v1.0.0-beta.21
[1.0.0-beta.20]: github/auth-server/compare/v1.0.0-beta.19...v1.0.0-beta.20
[1.0.0-beta.19]: github/auth-server/compare/v1.0.0-beta.18...v1.0.0-beta.19
[1.0.0-beta.18]: github/auth-server/compare/v1.0.0-beta.17...v1.0.0-beta.18
[1.0.0-beta.17]: github/auth-server/compare/v1.0.0-beta.16...v1.0.0-beta.17
[1.0.0-beta.16]: github/auth-server/compare/v1.0.0-beta.15...v1.0.0-beta.16
[1.0.0-beta.15]: github/auth-server/compare/v1.0.0-beta.14...v1.0.0-beta.15
[1.0.0-beta.14]: github/auth-server/compare/v1.0.0-beta.13...v1.0.0-beta.14
[1.0.0-beta.13]: github/auth-server/compare/v1.0.0-beta.12...v1.0.0-beta.13
[1.0.0-beta.12]: github/auth-server/compare/v1.0.0-beta.11...v1.0.0-beta.12
[1.0.0-beta.11]: github/auth-server/compare/v1.0.0-beta.10...v1.0.0-beta.11
[1.0.0-beta.10]: github/auth-server/compare/v1.0.0-beta.9...v1.0.0-beta.10
[1.0.0-beta.9]: github/auth-server/compare/v1.0.0-beta.8...v1.0.0-beta.9
[1.0.0-beta.8]: github/auth-server/compare/v1.0.0-beta.7...v1.0.0-beta.8
[1.0.0-beta.7]: github/auth-server/compare/v1.0.0-beta.6...v1.0.0-beta.7
[1.0.0-beta.6]: github/auth-server/compare/v1.0.0-beta.5...v1.0.0-beta.6
[1.0.0-beta.5]: github/auth-server/compare/v1.0.0-beta.4...v1.0.0-beta.5
[1.0.0-beta.4]: github/auth-server/compare/v1.0.0-beta.3...v1.0.0-beta.4
[1.0.0-beta.3]: github/auth-server/compare/v1.0.0-beta.2...v1.0.0-beta.3
[1.0.0-beta.2]: github/auth-server/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: github/auth-server/compare/v1.0.0-beta.0...v1.0.0-beta.1
[1.0.0-beta.0]: github/auth-server/releases/tag/v1.0.0-beta.0
