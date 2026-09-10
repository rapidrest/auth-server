# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: github/auth-server/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: github/auth-server/compare/v1.0.0-beta.0...v1.0.0-beta.1
[1.0.0-beta.0]: github/auth-server/releases/tag/v1.0.0-beta.0
