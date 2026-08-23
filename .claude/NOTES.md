# Code review notes — rapidrest/auth-server

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.

## Standing decisions

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

## Session Log

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
