# Code review notes — rapidrest/auth-server

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.

## Standing decisions

- **Commit discipline.** Don't `git commit` unless explicitly asked, even after a full
  review-and-fix cycle with passing tests. Leave changes staged/unstaged and say so.
- **This is a monorepo checkout, not isolated packages.** `auth-server` sits alongside its own
  `@rapidrest/*` dependencies as sibling directories under `d:\github\rapidrest\`: `auth`,
  `core`, `react`, `service-core`, `cli`. All are owned by the same author (Jean-Philippe
  Steinmetz) as `auth-server` itself. When a bug traces into one of these packages, fix it at
  the source in the sibling repo (then rebuild + patch/republish) rather than working around it
  only in `auth-server` — these aren't third-party deps you can't touch.
- `@rapidrest/react` is consumed from the npm registry (not a workspace/portal link), so a
  source fix in the sibling `react` repo does **not** automatically reach `auth-server`'s
  `node_modules`. Either `yarn patch`/`yarn patch-commit` the installed copy for an immediate
  fix, or bump the version once the sibling package is rebuilt and republished (`^1.0.1`
  currently does **not** need a patch — see Session Log 2026-08-22).
- TypeORM 1.x dropped the plain `"sqlite"` driver (the async `sqlite3`-backed one). Only
  `"better-sqlite3"` (sync) and `"sqljs"` remain for file/in-memory SQLite. Any config using
  `type: "sqlite"` needs to become `type: "better-sqlite3"`, and the `better-sqlite3` npm
  package must be installed. TypeORM 1.1.0's peer range is `better-sqlite3@^12.0.0` — the
  installed latest major (13.x) is *not* compatible; pin to the latest 12.x.
- `better-sqlite3` takes an exclusive lock per write and has no built-in cross-connection
  queuing the way the old async `sqlite3` driver tolerated. If two separate datastores (e.g.
  `acl` and `sql`) are configured to point at the **same** file and both connect concurrently
  (this framework's `ConnectionManager.connect()` opens all datastores via `Promise.all`), the
  second one can throw `SqliteError: database is locked` during startup schema sync. Enabling
  `enableWAL: true` does **not** reliably fix this in practice (confirmed by reproducing it) —
  giving each datastore its own file is the fix that actually works. Don't colocate SQLite
  datastores in test config unless there's a specific reason to.
- Test mocks for Redis must target the `redis` package (node-redis v4 client, `createClient`),
  not `ioredis` — the app migrated off `ioredis` and `ConnectionManager` now does a literal
  `import("redis")`. A reusable in-memory fake (`FakeRedisServer`/`FakeRedisClient`, covering
  `get/set/setEx/ttl/del/unlink/scanIterator/multi().execAsPipeline[Typed]()/publish/subscribe`)
  already exists in `service-core`'s own test suite at `test/helpers/FakeRedis.ts` (not
  published via the package's `/test` export) — mirror it locally rather than reinventing it;
  `auth-server` has its own copy at `test/helpers/FakeRedis.ts` for this reason. Mock with
  `vi.mock("redis", async () => (await import("./helpers/FakeRedis.js")).createFakeRedisModule())`.
- `DefaultAccounts` (in `@rapidrest/auth`) only logs the raw one-time password when
  `auth:password_file` is falsy. By default (`"passwords"`), it writes the password to that
  file instead and logs `Password: See '<path>'`. Any test asserting against the logged
  password must `config.set("auth:password_file", "")` first. Also note the log line wraps the
  password in literal single quotes (`` Password: '<password>' ``) — strip both the prefix and
  the trailing quote when parsing it back out of the log.
- Don't take TypeScript to a new major automatically. TS 7.0.x breaks `@typescript-eslint`'s
  peer range (only supports up to ~6.x) and Yarn's built-in TS compat patch fails to apply
  against it. Stay on the latest 6.x until the toolchain catches up.
- `eslint-plugin-import@2.32.0` (latest) doesn't declare peer support for ESLint 10 yet — the
  resulting Yarn peer-dependency warning is expected/harmless, not a sign something broke.

- `config.get(key)` in nconf (used throughout via `@Config`) does **not** deep-clone nested
  values on the way out: `Memory.prototype.get` returns the internal store object by direct
  reference, and `Provider.prototype._execute`'s single-source merge path
  (`Memory.prototype.merge` → `target[key] = value` when `target[key]` is not yet an object)
  passes non-colliding nested objects through untouched. Practically: `const x = config.get("a")`
  then `delete x.b.c` mutates the **live, shared** config object for every future
  `config.get("a")` call in the process — there is no defensive-copy safety net anywhere in this
  chain (nconf itself, nor `ObjectFactory.initialize()`'s `obj[member] = this.config?.get(path)`
  in `@rapidrest/core`, which assigns the same reference into injected `@Config` fields). Never
  mutate an object returned from `config.get()` in place; clone first
  (`{ ...config.get("auth"), options: { ...config.get("auth").options } }`).

- **A plain sign-in token never carries trusted roles.** `POST /auth/mfa` (and `/auth/password`)
  return a token/cookie with `roles: []` even for an account whose `User.roles` really is
  `["admin"]` in the database — confirmed by direct DB inspection, not a persistence bug. Trusted
  roles only appear after a separate elevation step: `POST /auth/elevation` with `{password}`
  (`elevateWithPassword()` in `apps/shared/lib/api.ts`) for an account with no enrolled second
  factor (true for every account this repo's own tooling provisions), which returns a new,
  short-lived elevated token/cookie that does carry `roles`. This is `@RequiresElevation()`
  working as designed (see `BaseAdminRoute`/`AdminConsoleRoute`), not a bug — any tooling/script
  that signs in and then expects to immediately call a trusted-role-gated endpoint (`/admin/*`,
  `/metrics`, `POST /users` with `verified`/`roles` set, etc.) needs this extra elevation call
  first, or it 403s with `api-102`.
- **`jwt`/`refresh` cookies are `Secure` by default** (see the earlier nconf/cookie standing
  decision), which is correct for a real HTTPS deployment but means any HTTP client whose cookie
  jar actually enforces RFC 6265 (k6, real browsers) will not carry them over a plain `http://`
  connection — confirmed while building `k6-tests/`. **curl's own cookie jar does not enforce
  this** (sends `Secure` cookies over plain HTTP regardless), which can produce a false "it works"
  result if you spot-check a cookie-dependent flow with curl instead of the real client. Test
  cookie-dependent flows (refresh, authenticated SSR pages) against an HTTPS target for a result
  that means anything.

- **The Helm chart in `helm/` was, until 2026-08-25, an unadapted copy of the `petstore_example`
  reference project's scaffold** — never touched since this repo's initial commit, per git log.
  `helm lint` failed outright (`chart.metadata.name is required`), and every app-specific resource
  name rendered as the literal string `-services` (missing the `{{ include "rrst.fullname" . }}`
  prefix `_helpers.tpl` already defines — only `templates/tests/test-connection.yaml` actually used
  it). If a *new* template file is ever added under `helm/templates/`, name its resources the same
  way the fixed ones now do (`{{ include "rrst.fullname" . }}-<suffix>` / `{{ include "rrst.name"
  . }}` for the `app:` label) — don't copy the un-prefixed pattern that was there before.
- **`helm dependency update` needs `Chart.yaml`'s `name:` field to actually be set** before it (or
  `helm lint`/`helm template`) will do anything at all with a chart — an easy first check when a
  chart mysteriously "does nothing."
- **Reading a Bitnami subchart's auto-generated password back out via `lookup` (the pattern
  `service-config.yaml`/`redis.yaml` use for the mongodb/redis root passwords) doesn't work on a
  brand-new `helm install`** — `lookup` only sees resources that already exist in the cluster, and
  the subchart's own Secret is created in the *same* install operation. The app starts with no
  datastore credentials wired in and crash-loops until a follow-up `helm upgrade` (no values need
  to change) picks up the by-then-existing secret. This is inherent to `lookup`'s documented
  behavior, not fixable by rewriting the template differently — see the CAVEAT comments in both
  files, and `templates/NOTES.txt`, which surfaces it to the operator directly.
- A generic YAML-aware IDE linter will flag most Helm template files in this chart as invalid YAML
  (`{{- ... }}` Go-template syntax, especially multi-line `{{- /* comment */ }}` blocks, reads as
  malformed flow-mapping syntax to a plain YAML parser). This is a false positive, not a real
  error — Helm templates aren't valid YAML until rendered. Trust `helm lint`/`helm template`
  (`helm/` has the `mongodb`/`redis` Bitnami subchart dependencies fetched via `helm dependency
  update` — network access to `charts.bitnami.com` confirmed available this session), not the
  editor's diagnostics, for this directory.

## Session Log

### 2026-08-25 — Docker/Helm deployment review, chart adapted from petstore scaffold to a real one

Full review of `Dockerfile`, `.dockerignore`, `docker-compose.*.yml`, and `helm/`. User decisions
going in: chart name `auth-server`, image `ghcr.io/rapidrest/auth-server`, keep the existing
Gateway API approach (not switching to plain Ingress). Validated throughout via `helm lint`/`helm
template` (real subchart deps fetched — see the standing decision above) and, for Docker, actual
`docker build` + live boot against real Mongo/Redis containers (confirmed non-root user, healthy
healthcheck, working API) — not just static reading. No live Kubernetes cluster was available
(Docker Desktop's k8s integration is installed but not running, and enabling it needs GUI
interaction), so the credential-wiring templates are verified as far as static rendering +
exact-secret-name/key cross-referencing against the real fetched subcharts can confirm, but not
via an actual `helm install`.

**Helm — chart-breaking, fixed:**
- `Chart.yaml`: `name:`/`description:` were blank → `helm lint` failed to even load the chart.
  Set `name: auth-server`, `appVersion: "0.1.0"` (matches `package.json`).
- Every app-specific resource (`1_deployments/service.yaml`'s Deployment,
  `2_services/api_services.yaml`'s Service, `3_gateways/api.yaml`'s HTTPRoute backend ref) was
  missing its `{{ include "rrst.fullname" . }}` prefix, rendering the literal invalid name
  `-services` and empty `app:` labels — fixed throughout, verified the full selector chain
  (Deployment pod labels → Service selector → HTTPRoute backendRef → Service name) now matches.
- `values.yaml`: `service.image.repository` was blank (→ `ghcr.io/:1.1.2`, unpullable) - set to
  `rapidrest/auth-server`; tag now defaults to `""` with the Deployment template falling back to
  `.Chart.AppVersion` (the `service.version`-vs-latest check that drove `imagePullPolicy` also
  referenced a field, `service.version`, that didn't exist anywhere in `values.yaml` — replaced
  with a direct check against the resolved tag). `service.mongodb.mongo.name` was blank (→
  `datastores__mongo__database: null`) - set to `rrst_auth`. `service.resources` didn't exist at
  all (→ `resources: <no value>`, invalid YAML) - added a real requests/limits map and fixed the
  template to `toYaml`/`nindent` it instead of interpolating directly. `service.imagePullSecret`
  also didn't exist - made `imagePullSecrets` conditional instead of requiring a dummy value.
- Removed two dead/unused values: `redis.usePassword` (not a real key this chart version reads —
  `auth.enabled` is; see the security fixes below) and `service.mongodb.mongo.fullnameOverride`
  (never referenced by any template).

**Helm — security, fixed:**
- Non-production pods launched `node --inspect=0.0.0.0:9229` — the unauthenticated Node inspector
  bound to *all* interfaces (RCE for anyone who can reach the pod on that port), and pointed at a
  nonexistent `dist/server.js` (real path is `dist/src/server.js`) so it was broken on top of
  being dangerous. Fixed to `127.0.0.1:9229` + the correct path.
- `templates/0_config/service_accounts.yaml` created a ServiceAccount + Role/RoleBinding granting
  `resources: ["*"], verbs: ["*"]` across core/apps/extensions/batch in the namespace — confirmed
  unused (not referenced by any Deployment's `serviceAccountName`, and neither `auth-server` nor
  its sibling packages ever talk to the Kubernetes API) and removed entirely rather than scoping
  it down to a permission level nothing in this codebase needs.
- `mongodb.auth.enabled`/`redis.auth.enabled` flipped `false` → `true` (both datastores had zero
  authentication by default). Wired the generated credentials into the app's actual connection
  config: `service-config.yaml` reads the mongodb subchart's root password back out (secret name =
  exactly `mongodb.fullnameOverride`, key `mongodb-root-password` — confirmed against the real
  fetched subchart template, not guessed) and sets `datastores__{acl,mongo}__{username,password}`
  + `options: authSource=admin` (required — root's credentials only exist in the `admin`
  database). `redis.yaml` does the same for `redis-password`, folding it into the connection URL
  (`redis://:<password>@host`) rather than as separate fields, since that's the shape
  `ConnectionManager.buildConnectionUri()` expects for redis specifically. See the `lookup`/first-
  install caveat in the standing decisions above — this is a real limitation, not incomplete work.
- `templates/0_config/tls-certs.yaml` referenced `.Values.namespace`, which doesn't exist anywhere
  in `values.yaml` (→ blank) — fixed to `.Release.Namespace`, used correctly everywhere else.
- `templates/0_config/redis.yaml`'s upgrade-preserving `lookup` checked for a secret named
  `db-cache-info`, but the secret it actually creates is named `db-redis-info` — the mismatch made
  the "preserve across upgrades" check permanently dead code. Moot now that the file was rewritten
  around the auth wiring above (which needs a *different* lookup, against the redis subchart's own
  secret, not this one), but worth remembering as a pattern to check for elsewhere.
- `templates/NOTES.txt` had the same wrong-secret-name bug for MongoDB credentials (looked up
  `mongodb-secrets`, which never existed, using keys — `MONGODB_DATABASE_ADMIN_USER`/`_PASSWORD` —
  that were never real either) - fixed to the real secret/key and the credential now actually
  displays after a successful `helm upgrade`.
- CORS origins built from `.Values.host` as a bare hostname (`"localhost"`, not `"http://localhost"`)
  — real browsers send an `Origin` header with a scheme, so this could never actually match. Fixed
  to build a proper scheme-qualified origin, deriving the scheme from `gateway.tls`.

**Docker, fixed (each rebuilt + live-boot-tested against real Mongo/Redis, confirmed non-root
process, healthy healthcheck, working API — not just read):**
- No non-root `USER` — container ran as root. Added `USER node` (the base image's built-in
  non-root user) plus `--chown=node:node` on every `COPY --from=builder`, after all root-only
  steps (package installs, `chmod`). Deliberately did **not** prune devDependencies from the
  runtime image, despite that being the more obviously "correct" hardening move — confirmed
  `docker-compose.debug.yml`'s `yarn debug` (→ `rapidrest dev --inspect`, a devDependency via
  `@rapidrest/cli`) depends on them being present, so this image intentionally serves both the
  production and dev-debug use cases from one build; pruning would break the existing debug
  workflow. Left as a known, deliberate tradeoff rather than "fixed."
- `.dockerignore` didn't exclude `passwords` (the plaintext-credential file — see the earlier
  standing decision — that a local `node dist/src/server.js` run leaves in the repo root), nor
  `coverage/`, `test/`, `k6-tests/`, `*.log`, `junit.xml` — all added.
- Fixed a leftover `# Use an official Python runtime as a parent image` comment (copy-paste
  artifact, this is a Node project) and the deprecated `ENV key value` syntax Docker's own
  buildkit linter flagged (`ENV key=value` now).

**Also fixed:** `helm/charts/*.tgz` (fetched Bitnami dependency archives) and the plaintext
`passwords` file were both previously untracked-but-not-ignored — added to `.gitignore` (the
former should be regenerated via `helm dependency update`/`Chart.lock`, not committed as binary
blobs; `Chart.lock` itself should still be committed).

### 2026-08-23 — critical startup crash found+fixed in @rapidrest/service-core; k6 load-test suite added

**Critical, 100%-reproducible startup crash, live on the documented Docker quick-start** (found
while trying to boot a real server to validate the k6 suite below — not caught by the existing
test suite because it mocks Redis with `FakeRedis`, which has no `duplicate()`/`connect()`
semantics to trip over). `docker-compose build && docker-compose up` (or plain `node
dist/src/server.js` against real Mongo+Redis) crashed every time, ~1.2s into startup, with
`ClientClosedError: The client is closed` inside `ACLUtils.saveDefaultACL()` →
`RedisCache.load()`. Root cause, confirmed by direct DB inspection and HTTP-level tracing (not
guessed): `@rapidrest/core`'s `ObjectFactory.initialize()` resolves any `@DataSource`/`@Redis`-
injected field by calling `.duplicate()` on the shared connection when the connection type
exposes that method (`typeof conn.duplicate === "function"`) — written with some other
duplicable connection type in mind, but a **node-redis client's `.duplicate()` also matches that
duck type, and unlike whatever the check was written for, returns a fresh, unconnected client**
that the injection code never calls `.connect()` on. Every `@Redis(...)`-injected field (e.g.
`RedisCache.redisClient`, used unconditionally on every startup by ACL bootstrap) got a dead
client. `service-core`'s own `EventListenerManager` had the identical latent bug in its
constructor (`this.redis = redis.duplicate()`, never connected) — dormant by default only because
`events:channels` defaults to `[]`, so `init()`'s `subscribe()` loop never actually runs; it would
crash the same way the moment an operator configures any event channels.

**Fixed at the source** in the sibling `service-core` repo (per the standing decision above — not
worked around locally): `ObjectFactory.initialize()` now awaits `.connect()` on the duplicated
connection when it looks redis-shaped (`isOpen: boolean` + `connect: function`, narrow duck typing
so it can't misfire against some other duplicable type); `EventListenerManager.init()` now
connects its duplicated client before subscribing, matching the pattern `BaseAdminRoute.init()`
already used correctly for its own duplicated publisher client. Applied to `auth-server` via
`yarn patch` (`.yarn/patches/@rapidrest-service-core-*.patch`, `package.json` resolutions) rather
than a local `node_modules` edit, so it survives `yarn install` — this is a stopgap until
`service-core` is rebuilt/republished for real; the source changes are uncommitted in the sibling
repo pending review. Verified: full `auth-server` suite (537/537) and a fresh
`docker-compose build && up` both pass/boot cleanly with the patch applied.

**Also fixed while validating the fix:** `passwords` (the file `DefaultAccounts` writes the
freshly-generated admin password to — see the standing decision on `auth:password_file`) was not
in `.gitignore`; a local `node dist/src/server.js` run leaves this file, containing a real
plaintext credential, sitting in the repo root ready to be swept into a careless `git add -A`.
Added to `.gitignore`.

**Added `k6-tests/`**: a k6 load-test suite modeled on `petstore_example`'s own `k6-tests/`
layout, covering `/status`, `/openapi/{json,yaml}`, public/authenticated SSR pages, sign-in,
refresh, self-service profile/secrets/aliases, and admin list/get/create/`/metrics`. Not a blind
port of the reference — see the two new standing decisions above (elevation, Secure cookies) and
`k6-tests/README.md` for why: naively porting petstore's "every VU signs in as the same account"
pattern immediately trips `auth-server`'s real rate limiter (petstore's own toy auth has none).
Self-service scripts spread logins across a pool of accounts `setup.ts` provisions ahead of time
(`testUsers.ts`, keyed by k6's `__VU`); admin-only scripts sign in and elevate exactly once per
run via k6's `setup()` lifecycle hook, regardless of VU count. Deliberately out of scope:
registration/MFA-challenge flows and OIDC, none of which a script can complete without receiving a
real out-of-band code or talking to a real third-party IdP. Every script individually validated
live against a real (patched, freshly-booted) server this session.

### 2026-08-22 — auto-enable sign-in on contact verification

Added a "Use this contact to sign in once verified" checkbox (default checked) to the Add
Contact modal (`AddContactModal.tsx`). `ContactsCard.tsx` carries that choice through to
`handleVerifyContact` via a `verifyingAutoEnableSignIn` piece of state, and on a successful
verification of a contact added through that flow, automatically calls `createAlias(type,
contact, true)` so the user doesn't have to separately click "Enable" afterward. Scoped
deliberately narrow: only the create→verify path sets this flag — re-verifying an
already-existing unverified contact via the table's own standalone "Verify" button (
`openVerifyModal`) never auto-enables, since that's not part of "creating" a contact and there's
no checkbox state to carry through for it. Alias creation failure after a successful verification
is treated as best-effort/non-blocking: the verify modal has already closed and the contact is
already marked verified, so a failure here surfaces as the card's own error banner rather than
reopening the verify modal or discarding the successful verification.

### 2026-08-22 — adversarial security/correctness/performance review (two independent agents)

Ran two independent adversarial review agents in parallel (one backend/route-focused, one
frontend + end-to-end-flow-focused) covering the entire `src/` and `apps/` trees, then
personally verified the two highest-severity claims by reading the actual dependency source
(nconf, `@rapidrest/core`, `@rapidrest/auth`, `jsonwebtoken`) rather than trusting the agents'
prose. Both top findings confirmed as real, live bugs on the production entrypoint.

**Critical — all issued access JWTs never expire** (`src/server.ts:42-44`). `start()` does
`const auth = config.get("auth"); delete auth.options.expiresIn;` intending to build a
throwaway config for one internal telemetry token. Because `config.get()` doesn't clone (see
Standing decisions above), this deletes `expiresIn` from the **shared** `auth.options` object
used by `TokenUtils` for every access token issued by every login route (password, MFA, OTP,
TOTP, FIDO2, Passkey, OIDC, registration — anything routing through
`TokenUtils.createAccessToken`, which spreads `this.jwtConfig.options` into `jwt.sign()`).
`jsonwebtoken` omits the `exp` claim entirely when `expiresIn` is absent, so every access token
becomes permanently valid. Refresh tokens are unaffected (`createRefreshToken()` re-sets
`expiresIn` explicitly after its spread). **Untested**: every test that boots a `Server`
constructs it directly from `@rapidrest/service-core` using the config modules directly and
never executes `src/server.ts`'s `start()`, so this has no test coverage. Fix: build the
telemetry-token config from a real clone, not a reference into the live config tree.

**Medium — `/metrics` is unauthenticated by default.** `metrics.authRequired: false` is set
explicitly in both `config.mongo.ts` and `config.sql.ts`, overriding `BaseMetricsRoute`'s safe
default of `true` (`@rapidrest/service-core`). Exposes per-route/per-status Prometheus counters
(including `req.path` for every registered route) to any unauthenticated caller — recon value,
not direct compromise.

**Low findings, all confirmed:**
- Comment above `auth.cookie` in both config files claims `secure` is "left false for local
  http://localhost development" — it isn't actually set anywhere, and `TokenUtils.buildCookie()`
  defaults to `Secure` unless `secure === false` is explicit. The comment is simply wrong (real
  behavior is already the safe default); risk is someone "fixing" it by adding `secure: false`
  under the mistaken belief that matches current behavior, which would be a real regression if
  that config is ever reused for a non-`localhost` deployment.
- OIDC `clientSecret`/`clientID` placeholder defaults (`oidc-test.com`) aren't covered by
  `assertProductionSecretsAreSet()` in `config.defaults.ts` — only `cookie_secret`/`auth:secret`/
  `session:secret` are guarded. Not currently exploitable (fake domain), but inconsistent with
  the file's fail-closed posture for the other three secrets.
- No default `trusted_proxies` in either config file. `NetUtils.getIPAddress()` correctly
  fails closed (ignores `X-Forwarded-For` when empty) but this means per-IP rate limiting and
  audit-log IPs collapse onto the proxy's fixed address for any deployment behind a reverse
  proxy/LB/CDN unless the operator explicitly configures it.
- `apps/shared/lib/useSessionRefresh.ts:38` — the recurring refresh-timer branch redirects to
  `/auth/signin` on **any** `refreshAccessToken()` rejection, including transient network/5xx
  failures, with no retry/backoff. An active user on a flaky connection gets force-logged-out
  and loses in-progress work on `/account` or the admin console.
- `apps/shared/components/account/contacts/ContactsCard.tsx:188-204` — `handleRemoveContact`
  does `saveContacts()` then `deleteAlias()` non-atomically; if the alias delete fails after the
  profile save succeeds, the alias silently remains a working sign-in credential for a contact
  no longer visible anywhere in the UI.

**What came back clean** (both agents independently, plus my own spot checks): no mongo/sql
route-implementation divergence anywhere (every route file is a thin subclass of the same
`@rapidrest/auth` base classes; genuinely identical wiring both backends); no XSS, no
`dangerouslySetInnerHTML`/`eval`/`postMessage` usage, no token-in-localStorage regression
(cookie-only, confirmed still true), no open redirects (all `window.location` targets are
hardcoded literals), no CSRF-relevant gaps, no SQL/NoSQL injection, timing-safe comparisons and
per-identifier+per-IP rate limiting present on login/challenge endpoints, PKCE/nonce/issuer/
audience validation present on OIDC, FIDO2 counter-regression checks present, anti-enumeration
on registration present, admin UI doesn't render before elevation-check resolves. No
auth-server-owned performance issues found — the app introduces no query code of its own (all
data-access logic lives in `@rapidrest/auth` base classes, out of scope for this pass).

**All findings above were fixed the same session** (see the immediately preceding commit for the
exact diff). Summary of each fix, since the *fix* is what future sessions need to not repeat the
mistake, not just the finding:
- `src/server.ts`: telemetry-token config is now built as a real clone (`{ ...configuredAuth,
  options: { ...configuredAuth.options } }`) before `delete`ing `expiresIn` off of it. See the
  new Standing decision above about `config.get()` never cloning — that's the actual root cause,
  and applies anywhere else a config object might get mutated in place in the future, not just here.
- `config.mongo.ts`/`config.sql.ts`: `metrics.authRequired` flipped `false` → `true` (matches
  `BaseMetricsRoute`'s own safe default — the override was actively opting into the unsafe
  behavior). Added a documented, empty-by-default `trusted_proxies: []` key (was previously
  absent entirely, not just empty, so the knob wasn't discoverable). Rewrote the cookie `secure`
  comment to describe the actual default (`Secure` included unless `secure: false` is explicit),
  not the inverted claim that was there before.
- `config.defaults.ts`: added `DEFAULT_OIDC_CLIENT_ID`/`DEFAULT_OIDC_CLIENT_SECRET` (shared with
  `config.mongo.ts`/`config.sql.ts`/both `AuthOIDCRoute.ts` files, so the guard and the actual
  shipped values can never drift apart) and extended `assertProductionSecretsAreSet()` to
  `console.warn` (not throw — this route is always mounted whether or not OIDC is actually used,
  so a hard failure would be overreach) when either OIDC placeholder is still in effect in
  production.
- `apps/shared/lib/useSessionRefresh.ts`: the recurring-refresh path now only redirects to
  `/auth/signin` immediately on an actual `ApiRequestError` with status 401/403 (a real auth
  rejection); any other failure (network blip, 5xx) retries up to 3 times on a 30s backoff before
  giving up and redirecting. `apps/shared/lib/api.ts`'s `ApiRequestError.status` is what makes
  this distinction possible — any future "is this failure terminal?" check elsewhere in the
  frontend should use the same `err instanceof ApiRequestError && (err.status === ...)` pattern
  rather than treating every rejection as equivalent.
- `apps/shared/components/account/contacts/ContactsCard.tsx`: `handleRemoveContact` now deletes
  the matching alias *before* saving the updated contacts list (was the other way around) — a
  failure partway through now leaves the alias already gone (safe: contact just still shows in
  the UI, retry works) instead of the alias silently surviving as an invisible working credential.
- All four affected test files updated/extended to cover the new behavior (`test/config.defaults.
  test.ts`, `test/apps/_lib/useSessionRefresh.test.ts`, `test/apps/account.test.tsx`) — full suite
  is 519/519 passing, `yarn build` still succeeds. Coverage gate still narrowly fails, but only on
  the exact same pre-existing gap noted in the entry above (`AuthMFARoute.ts`/`SecretForm.tsx`/
  `detail/index.tsx`) — nothing newly introduced this session is uncovered.

### 2026-08-22 — dependency update + build/test fixes

Updated all dependencies to latest-possible versions, then fixed two categories of breakage
this surfaced (both pre-existing, unmasked rather than caused by the version bumps):

- **`yarn build` failure** (`Cannot resolve entry module index.html`): root-caused to
  `@rapidrest/react`'s `rapidRestHydrationPlugin` (`src/vite.ts`). Vite 8's rolldown bundler
  pre-fills `build.rollupOptions.input` with a resolved (and, for this framework, always
  nonexistent) `index.html` path before any plugin's `options()` hook runs, whenever no
  explicit entry is configured. The plugin blindly merged that phantom path in as a real
  "existing" entry, so rolldown then failed resolving a file that doesn't exist. Fixed by
  capturing the resolved config root via a new `configResolved()` hook and comparing against
  it exactly in `options()`, so only that specific placeholder gets dropped — any entry a
  caller/other plugin genuinely supplies is still preserved (this distinction mattered: an
  earlier draft that filtered by `fs.existsSync()` broke the plugin's own test suite, which
  intentionally passes non-existent fixture paths and expects them preserved). Published as
  `@rapidrest/react@1.0.1`; `auth-server` no longer needs the `yarn patch` workaround used
  mid-session to unblock the build before the republish landed.
- **Test failures**: three independent, pre-existing bugs (see Standing decisions above for
  each): stale `ioredis` mocks no longer intercepting the app's `redis` client,
  `type: "sqlite"` no longer valid in TypeORM 1.x, and `DefaultAccounts.sql/mongo.test.ts`
  asserting against a log line that (a) was actually a "see file" placeholder because
  `auth:password_file` wasn't disabled, and (b) even after fixing that, still included stray
  quote characters from the log format. All fixed; full suite is 511/511 passing.
- Residual, out-of-scope item: the coverage-threshold gate (`vitest run --coverage`) narrowly
  misses 100%/99% (99.93%/98.95%) in three files nobody touched this session
  (`AuthMFARoute.ts`, `SecretForm.tsx`, `detail/index.tsx`). Pre-existing gap, not investigated
  further.
- Tooling note: the Bash tool's cwd resets between calls if you `cd` into a sibling directory
  outside the project root (e.g. `/d/github/rapidrest/react`) — use a subshell
  (`(cd /d/github/rapidrest/react && yarn build)`) instead of a bare `cd`.
