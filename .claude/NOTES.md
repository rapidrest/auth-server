# Code review notes — rapidrest/auth-server

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.

## Standing decisions

- **Commit discipline.** Don't `git commit` unless explicitly asked for *that specific piece of
  work*. An autonomous-execution/"commit as you go" approval given for one approved plan (e.g. via
  plan mode) is scoped to that plan only — it does not carry forward to later, separate requests in
  the same session, even ones that look similar in kind (a follow-up review-and-fix pass, a
  refactor, a new feature), and even after a full review-and-fix cycle with passing tests. Default
  to leaving changes staged/unstaged and saying so; only commit automatically within the exact
  scope of a plan that was explicitly approved as autonomous. If unsure whether new work falls
  inside that scope, treat it as outside and ask.
- **Commit message style: a flat list of one-line, verb-led items — no summary/title line, no
  `-`/`*` bullet markers.** This isn't just a style preference — it's dictated by how `release`
  (`@rapidrest/cli`) actually builds `CHANGELOG.md`. `collectChangelogBullets`/
  `classifyChangelogLine` (that repo's `src/lib/release.ts`) parse `git log --pretty=format:%B` and
  treat **every non-blank line of a commit's full message as its own changelog bullet** — there is
  no subject/body distinction. A conventional "short imperative subject + blank line + prose body"
  commit therefore leaks one changelog bullet per body sentence, and a `-`/`*`-prefixed line breaks
  `classifyChangelogLine`'s verb detection (it reads the line's first whitespace-delimited word as
  the verb; a leading `-` defeats that lookup and the dash leaks into the changelog text as
  `"- - Added foo"`). Correct format:
  - No separate summary/title line — if a commit needs an overview, that overview is itself just
    one more flat line, not a heading distinct from the rest.
  - No bullet-marker prefix of any kind — write bare lines.
  - Lead each line with an imperative verb where it fits: `Add`/`Fix`/`Remove` (and `-ing` forms)
    are recognized and become `Added`/`Fixed`/`Removed` entries; `Configuring`/`Converting`/
    `Refactoring`/`Updating`/etc. become `Changed`. Anything else still works, defaulting to
    `Changed` verbatim — see `CHANGELOG_VERB_REWRITES` in that repo's `src/lib/release.ts` for the
    full map.
  - A blank line before a trailing git trailer (`Co-Authored-By:`, `Signed-off-by:`, etc.) is fine
    — trailers matching `CHANGELOG_NOISE_PATTERNS` are dropped from the changelog — but nothing
    else should follow the item list.
  This mirrors JP's standing convention across his other repos; copy this exact rule verbatim into
  each sibling repo's own NOTES.md rather than paraphrasing it, since the paraphrase is what caused
  this to be gotten wrong in the first place (see `@rapidrest/cli`'s own NOTES.md, 2026-09-07 entry,
  for the full incident writeup and the `CHANGELOG_NOISE_PATTERNS` fix that accompanied it).
- **This is a monorepo checkout, not isolated packages.** `auth-server` sits alongside its own
  `@rapidrest/*` dependencies as sibling directories under `d:\github\rapidrest\`: `auth`,
  `core`, `react`, `service-core`, `cli`. All are owned by the same author (Jean-Philippe
  Steinmetz) as `auth-server` itself. When a bug traces into one of these packages, fix it at
  the source in the sibling repo rather than working around it only in `auth-server` — these
  aren't third-party deps you can't touch.
- **Never bump a `package.json` `version` field, in this repo or any sibling `@rapidrest/*` repo,
  and never publish/`npm publish` one.** JP has a formal release process for that (see e.g.
  `auth-server`'s own `"version"`/`"postversion"` npm-lifecycle scripts, which sync the Helm
  chart/README and push tags — a manual version edit bypasses all of that and produces conflicts).
  This applies even when a fix in a sibling repo is otherwise done and verified: land the source
  fix, leave the version field alone, and tell JP it's ready for him to version/publish himself.
  Once he publishes, bump *this* repo's dependency constraint (e.g. `"@rapidrest/auth": "^X.Y.Z"`)
  to the version he actually published — that part is fine, since it's just declaring what this
  repo needs, not deciding a sibling repo's own release number.
- `@rapidrest/react` is consumed from the npm registry (not a workspace/portal link), so a
  source fix in the sibling `react` repo does **not** automatically reach `auth-server`'s
  `node_modules`. For an immediate fix ahead of a real publish, `yarn patch`/`yarn patch-commit`
  the installed copy rather than bumping any version field (`^1.0.1` currently does **not** need a
  patch — see Session Log 2026-08-22).
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

### 2026-09-09 (latest) — `@rapidrest/react` 2.0.0-beta.0: dynamic `[id].tsx` routes + nested non-index pages; refactored every page onto them

`@rapidrest/react` 2.0.0-beta.0 (already the installed dependency version, bumped by a prior automated
dep-bump commit before this session started) added two file-based-routing features this app previously
had no way to use: (1) a nested page no longer needs its own `index.tsx` — `apps/foo/bar.tsx` is now a
valid leaf page exactly like `apps/foo/bar/index.tsx` was; (2) bracketed filenames capture a dynamic
path segment — `apps/foo/[id].tsx` serves `GET /foo/:id`, with the captured value exposed as
`props.params.id` on the page component (see `ReactRoute.tsx`'s own class-doc-comment for the full
convention). Both together retire the old workaround this app used for a per-record "detail" page: no
dynamic segments meant the target uid had to travel as a `?uid=` query string, read back out via a
`readTargetUid()`/`typeof window === "undefined"` SSR guard on every such page.

**Flattened folder+`index.tsx` pages that had no other reason to be nested** (7): `.../oauth-clients/new/
index.tsx` → `.../new.tsx`, `.../users/new/index.tsx` → `.../new.tsx`, `.../settings/index.tsx` →
`settings.tsx`, `apps/www/account/index.tsx` → `account.tsx`, `.../auth/{authorize,signin,signup}/
index.tsx` → `.../auth/{authorize,signin,signup}.tsx`. **Deliberately left `apps/admin/oauth-clients/
index.tsx` nested** (tried flattening it to a sibling `oauth-clients.tsx` first — confirmed it resolves
fine against `ReactRoute`'s own resolution order — but JP reverted it during this same session: when a
resource's folder already has to exist for its sub-routes (here, `.../oauth-clients/new.tsx` and `.../
oauth-clients/[uid].tsx`), its own list page reads better as that folder's `index.tsx` than as a flat file
sitting beside its own subfolder. Apply this same call the next time a similar "list page whose resource
folder must exist anyway" case comes up — don't reflexively flatten it just because the framework allows it.

**Converted the two query-param "detail" pages to real dynamic routes**: `apps/admin/oauth-clients/
detail/index.tsx` → `apps/admin/oauth-clients/[uid].tsx`, `apps/admin/users/detail/index.tsx` → `apps/
admin/users/[uid].tsx`. Both now take `params: { uid: string }` as a normal prop — no more
`readTargetUid()`, no more `useState(lazyInitializer)` to smuggle a window-read value past SSR, no more
"no uid specified" empty-state branch (structurally unreachable now — a bare `/oauth-clients` or
`/users` request resolves to that folder's own list page, not to `[uid].tsx` with an empty capture). Every
internal link/redirect building the old `/…/detail?uid=X` URL (list-table "View" links, post-create
redirects in the two `new.tsx` pages) now builds `/…/X` instead. Left the **other** `?query=` usages in
this app alone — `/auth/authorize`'s OAuth request params (`client_id`/`redirect_uri`/`scope`/etc., spec-
mandated query-string shape, not an internal workaround), `/auth/signin`'s `?returnTo=` hand-off (an
arbitrary redirect URL, not a resource id), and `/auth/signup`'s `?type=`/`?id=`/`?autosend=1` hand-off
from sign-in (transient flow state, not a route-addressable resource) — none of those are "an identifier
that should have been a path segment," so converting them would misuse the feature, not use it correctly.

Verified with `tsc --noEmit` against `tsconfig.client.json` (apps/) and `tsconfig.test.json` (src+test+
apps) — zero new errors introduced (the handful of pre-existing `tsconfig.test.json` errors, e.g.
`objectFactory.newInstance(RepoUtils, ...)` typing to `unknown`, predate this session and aren't enforced
by any actual script — there's no `typecheck` script in `package.json`, only `yarn lint`, which passed
clean) — plus a full `yarn vitest run`: 816/816 passing, 100% coverage maintained (4 fewer tests than
before this session's start, exactly the 2 now-unreachable "no uid specified" tests + 2 `readTargetUid()`
SSR tests removed along with the dead code they covered).

### 2026-09-06 — `logger.error(err)` always prints "error: undefined", hiding real errors; fixed at the source

JP reported a login failure while testing the OAuth work, with only `[DerivedLogger.emit] ... error:
undefined` in the log — no actual message. Root-caused (confirmed with a standalone repro script, not
guessed): `@rapidrest/core`'s `src/Logger.ts` builds its format chain as `combine(format.splat(),
format.simple(), timestamp(), source(), logFormat)`, with no `format.errors()` step. Winston's
`Logger.log()` uses an `Error` passed directly to `.error(err)` *as the `info` object itself* (its
`arguments.length === 2` fast path), and `Error.prototype.message`/`.stack` are non-enumerable own
properties — so every format step downstream that copies via `Object.assign({}, info, ...)`
(`format.simple()` among them) silently drops `message` before `logFormat`'s `printf` ever sees it.
**Every `logger.error(someError)` call anywhere in this app (or any app using this `Logger`) prints
`error: undefined` regardless of what the error actually says** — this is a real, standalone,
100%-reproducible bug in `core`, not specific to OAuth or login at all; `Server.js`'s catch-all
error-handling middleware (`this.logger.error(err)` for any non-`ApiError` or `>=500` `ApiError`) hits
it on every uncaught route error. `logger.info`/`.warn`/etc. with a plain string are unaffected.

**Fixed at the source** in the sibling `core` repo (per the standing decision — not worked around only
in `auth-server`): added `errors({ stack: true })` as the *first* step in the combine chain in
`src/Logger.ts`, which re-hydrates `message`/`stack` as real enumerable properties before anything else
touches `info`. Added a regression test to `core`'s own `test/Logger.test.ts` (logs a real `Error` via
`.error()`, asserts the message lands in the file transport and `error: undefined` never appears). Full
`core` suite: 509/509 passing (5 pre-existing skips), clean build. **Not published** — per the version
standing decision, left for JP to version/publish `core` himself; propagated locally into
`auth-server/node_modules/@rapidrest/core/dist/lib/Logger.{js,js.map}` only (not the rest of `dist/`,
which has unrelated in-progress drift in `core`'s `ClassLoader.js` not part of this fix) so local
dev/testing sees real error messages immediately. This local `node_modules` copy reverts on a clean
`yarn install`, same caveat as every other pre-publish sibling-repo fix noted elsewhere in this file —
bump `auth-server`'s `@rapidrest/core` constraint for real once JP publishes the fix.

**Did not reproduce an actual login failure**, despite trying hard to: built a full live-server repro
(sqlite + fake-redis, same harness `OAuthIntegration.sql.test.ts` uses) that signs in an admin-role
account, hits `/api/admin/release-notes` (correctly 403s pre-elevation), elevates, creates both a
first-party and a non-first-party `Client`, and drives the *full* `/oauth/authorize` → consent →
`/oauth/token` (PKCE) exchange as that admin-role user end-to-end — every step returned exactly the
expected response, no errors logged at all, with the fixed logger in place to prove it (an unfixed
logger would have shown `error: undefined` for any failure here, same as JP's report, and didn't).
So the request-handling code path itself checks out clean for this exact scenario. **Leading theory**,
not yet confirmed: JP's real dev Postgres database predates today's `@rapidrest/auth` bump to
`2.0.0-beta.3` (the `Client.clientId` column removal — see the entry below) — TypeORM's
`synchronize: true` does not drop columns it no longer recognizes, so a lingering NOT-NULL legacy
`clientId` column would make *any* insert into `Client` (or possibly other OAuth tables) throw a real,
raw driver-level error (not an `ApiError`), which is exactly the shape that hits the buggy log line.
Unconfirmed because this session has no access to JP's actual Postgres/Redis instance. **Next step**:
JP should retry the failing login now that the logger fix is in place locally and share the resulting
(now-real) error message/stack — if the Postgres-drift theory is right, dropping/recreating the
dev database's `Client`/`ConsentGrant`/`AuthorizationCode`/`OAuthRefreshToken`/`SigningKey` tables (or
the whole dev DB, since it's local/disposable) should resolve it.

**Follow-up, same session**: the Postgres-drift theory above was wrong — JP retried with the logger
fix in place and got the real error immediately: `ERR unknown command 'INCREX', with args beginning
with: 'auth:ratelimit:admin' 'EX' '300' 'ENX'`. Root cause and fix are the sibling `auth` repo's
`RateLimiter` (see its own `.claude/NOTES.md`, same date, for the full writeup) — `INCREX` is a Redis
8.8+ command with **no fallback** in `incrementRedis()`, and JP runs `yarn dev` (the `cli` repo's
`redis-memory-server`-backed ephemeral Redis), which on Windows downloads Memurai, currently cached at
a Redis-7.4-equivalent build with no stable Redis-8-compatible release available yet. Confirmed via
Redis's own docs that this isn't Windows/Memurai-specific: Redis Software and Redis Cloud don't support
`INCREX` yet either, so this would have broken login on most real production Redis deployments too, not
just local dev. Fixed at the source in `auth` (graceful fallback to the in-memory counter on this
specific error, with a one-time warning), propagated locally into `auth-server/node_modules/@rapidrest/
auth/dist` the same way as the `core` fix above. Not published — same caveat.

### 2026-09-06 — build broken by an automated dependency-bump reverting `@rapidrest/auth`; fixed

Right after the `clientId`→`uid` propagation below was committed, two more commits landed on `main`
(`abc61e7 "Upgrading @rapidrest/auth dep"`, `2135479 "Upgrading @rapidrest/react dep"`) with the exact
mechanical shape of an automated dependency-updater (single-package `package.json`+`yarn.lock` diff, no
other changes) — author attribution is JP's, but these were almost certainly bot-driven, not typed by
hand. **The `@rapidrest/auth` one silently reverted the version constraint from `^2.0.0-beta.2` all the
way back to `^1.3.0`** — a release that predates every phase of the OAuth authorization-server work.
Likely cause: `@rapidrest/auth`'s `2.0.0` line has only ever been published as `beta.x` prereleases,
never tagged `latest` on the registry — a naive auto-updater that only considers the `latest` dist-tag
would see `1.3.0` as the "latest stable" and "upgrade" a beta-pinned range down to it, which is a real
downgrade in this case. This broke `yarn build` outright (every `Models.ts`/OAuth route file failed
with "has no exported member" — the exports were never missing from the library, the installed
dependency was just years-old relative to this repo's own code).

**Fixed**: bumped `package.json` back up — and in the process discovered `@rapidrest/auth@2.0.0-beta.3`
is now actually published (JP must have run the release between sessions) and **already includes** the
`Client.clientId` removal from the entry below, making this repo's local `node_modules` dist-copy
workaround unnecessary. Constraint set to `^2.0.0-beta.3`, `yarn install`, `yarn build` clean, full
suite 676/676 at 100% coverage on all four metrics.

**Risk to watch**: whatever ran those two "Upgrading X dep" commits can silently downgrade
`@rapidrest/auth` again the next time it runs, as long as `2.0.0` stays on prereleases only (a `beta.4`
still won't be `latest`-tagged). If the build mysteriously breaks again with "has no exported member"
errors for anything OAuth-related, check `git log -- package.json` for another one of these commits
before assuming a real regression in the library.

### 2026-09-06 — real end-to-end OAuth integration test; found and fixed two real bugs along the way

Built `test/OAuthIntegration.{sql,mongo}.test.ts`: a genuine end-to-end test against a real (if
lightweight) running server — register a client via the owner API → `/oauth/authorize` (no session →
consent required) → approve consent → exchange the code at `/oauth/token` with real PKCE → verify the
access token's signature against the live `/.well-known/jwks.json` → call `/oauth/userinfo` with the
bearer token and check it reflects a *genuinely OTP-verified* profile contact → redeem the refresh
token (rotation) → confirm reusing the retired one is rejected. This is the manual checklist from the
original cross-repo wiring plan, now automated. Both pass; full suite still 676/676, 100% coverage.

**Two real bugs found and fixed via this test — this is exactly the kind of gap a "wire it all
together" integration test exists to catch, that mocked unit/component tests structurally cannot:**

1. **`@rapidrest/auth`'s `BaseOAuthClientRoute` never generated a `clientId`** — it silently persisted
   the model's empty-string default on every create. Since `clientId` has a **unique index**, the
   *second* client ever created in a real deployment would have failed outright.
   **Superseded same day**: rather than just generating one server-side, the upstream `auth` repo
   removed the separate `clientId` field from `Client` entirely — `Client.uid` (already unique,
   auto-generated, exposed in every API response) is now the OAuth `client_id` everywhere (see the
   `auth` repo's own `.claude/NOTES.md`, 2026-09-06 entry, "`Client.clientId` removed entirely").
   **Propagated here same day**: this repo's `node_modules/@rapidrest/auth` dist was refreshed
   wholesale from `auth`'s own freshly-built `dist/` (superseding the now-obsolete
   generate-a-clientId patch), and `test/OAuthIntegration.{sql,mongo}.test.ts` updated to read
   `createClientRes.body.uid` instead of `.clientId`. `yarn build` clean; both integration test
   files pass; full suite 676/676 at 100% coverage on all four metrics. **Still not published** —
   the `node_modules` dist refresh is local-testing-only and will revert to the stale published
   `2.0.0-beta.2` behavior on the next clean `yarn install`, same caveat as before. Once
   `@rapidrest/auth` is actually published with this refactor: bump `package.json`'s version
   constraint and `yarn install` for real — no further test changes needed at that point, since
   they already reflect the `uid`-based model.
2. **`auth-server` itself was still on the pre-fix `@rapidrest/core@^5.1.0`** — the real
   `"algorithms" is not allowed in "options"` JWT-signing bug (see [[project_rapidrest_core_sibling]])
   was published as a fix in `5.2.0` back on 2026-09-05, but nothing in this app's own dependency
   range had ever required bumping to it, because nothing here ever signed a token with an asymmetric
   (RSA) key before the OAuth authorization-server work — every prior use of `JWTUtils` in this app
   used a shared HMAC secret, where the bug never triggers. **Fixed**: bumped `@rapidrest/core` to
   `^5.2.0` in `package.json` and reinstalled — this one **is** a real, permanent fix in this repo,
   not a local-only patch.

**Also found and fixed a real bare-path query-encoding gotcha**, not a product bug but worth
remembering for any future test/client hitting `/oauth/authorize` directly: `URLSearchParams`'s
`.toString()` encodes a space as `+`, and this server's query parser does not decode `+` back to a
space — so a scope param built via `URLSearchParams` silently arrives as one single mangled token
that matches nothing, and `/authorize` computes an empty granted scope with no error at all. Build
OAuth query strings by hand with `encodeURIComponent` (`%20` for a space) instead.

**Extended the shared `test/helpers/FakeRedis.ts` mock** with `exists()` (a bog-standard Redis
command, missing entirely before this) — needed by `AccessTokenDenylist`'s jti-revocation check,
which the `/oauth/userinfo` bearer-auth path exercises for the first time in this app's test suite.
Genuinely generic and safe to have added for any future test. By contrast, `RateLimiter`'s atomic
`INCREX`-based command is NOT implemented in the fake (a bespoke compound operation, not a standard
command) — rate limiting is disabled outright (`auth:rateLimit: {enabled: false}`) in both new
integration test files rather than extending the fake for that one case.

### 2026-09-05 (later still) — Phase D: public `/authorize` consent screen + `returnTo` on sign-in

Final phase of the cross-repo OAuth wiring plan — the public-facing side, on top of Phase B's backend
and Phase C's admin console.

- **New page `apps/www/auth/authorize/index.tsx`**: reads the OAuth request's own query params via
  `fetchProps(req)` (`response_type`/`client_id`/`redirect_uri`/`scope`/`state`/`code_challenge`/
  `code_challenge_method`/`nonce`/`prompt`, passed through unmodified), plus the framework-injected
  `userUid`. No `userUid` → `window.location.replace` to `/auth/signin?returnTo=<this page's own
  URL, re-encoded>`. With a session, calls the new `requestAuthorization()` and branches on the
  outcome: `{redirectTo}` → navigate immediately (covers both a successful code issuance and a
  spec-shaped `?error=...` redirect — `BaseOAuthAuthorizeRoute.buildErrorRedirect()` returns the same
  shape as success); `{loginRequired:true}` → same sign-in redirect (defensive — session may have
  expired between page load and the call); `{consentRequired:true, requestId, client}` → renders the
  consent card (client name/logo, a human-readable scope list via a small `describeScope()` map,
  Approve/Deny). Approve/Deny both call `submitConsent(requestId, approved)`, which always resolves
  to `{redirectTo}` (a denial redirects with `?error=access_denied` rather than throwing) — passed
  `consent.requestId` directly from the already-narrowed value at the call site rather than
  re-deriving it from state inside the handler, so there's no unreachable "shouldn't happen" branch
  to leave uncovered.
- **New `apps/shared/lib/api.ts` additions**: `AuthorizeQueryParams`/`AuthorizeClientSummary`/
  `AuthorizeOutcome` types, `requestAuthorization()`, `submitConsent()`, and a new internal
  `oauthFetch()` helper. **`oauthFetch` exists because `apiFetch()` can't be reused as-is** — it
  hardcodes an `/api` prefix, but `/oauth/authorize`/`/oauth/authorize/consent` are deliberately bare
  paths (see Phase B's note above on `@Route` vs `@ApiRoute`). `oauthFetch` duplicates `apiFetch`'s
  error-decoding (including the same `res.json().catch(() => undefined)` malformed-body guard — don't
  forget a test for that specific branch when copying this pattern again, it's easy to miss) but
  intentionally does NOT replicate the `api-104` elevation-retry logic, since neither endpoint is
  `@RequiresElevation`-gated.
- **All exact query-param names, response shapes, and error semantics were verified by reading
  `@rapidrest/auth`'s compiled `BaseOAuthAuthorizeRoute.js` directly**, not assumed from the original
  plan — confirmed e.g. that `buildErrorRedirect()` returns the same `{redirectTo}` shape as success
  (so the page needs only one navigate-away branch, not a separate error-redirect case).
- **`returnTo` added to `apps/www/auth/signin/index.tsx`**: `readReturnTo()` reads `?returnTo=`;
  `isSafeReturnTo()` gates it before ever assigning to `window.location.href` — same-origin relative
  paths only. Rejects: no leading `/` at all (an absolute URL, `javascript:`, etc.), a leading `//`
  (protocol-relative URL — same scheme, different host), a leading `/\` (some browsers normalize a
  leading backslash to a second forward slash). **Also strips tab/CR/LF characters before those
  checks**, matching the WHATWG URL parser's own preprocessing — otherwise something like
  `"/\t/evil.com"` would pass a naive prefix check here but still get parsed by the browser as
  `"//evil.com"` once assigned. This is a real, known bypass class for exactly this kind of check, not
  a hypothetical — don't drop the stripping step if this logic is ever touched again.
- Full test suite added: `test/apps/auth/authorize.test.tsx` (jsdom, interactive), `test/apps/_lib/
  authorize.test.ts` (the two new `api.ts` functions, including bare-path assertions and every
  `oauthFetch` error-decoding branch), plus a `returnTo`-focused block added to the existing
  `signin.test.tsx` and a `signin.ssr.test.tsx` for `readReturnTo()`'s no-`window` branch.
- **Two rounds of coverage gaps found and fixed on full-suite runs** (same "did the last run actually
  hit every branch" habit as every prior phase): (1) the unreachable `handleDecision` guard mentioned
  above — fixed by removing the guard entirely rather than contriving a test for dead code; (2) the
  `email`/`phone`/`offline_access` branches of `describeScope()` were never exercised (only
  `openid`/`profile`/the unknown-scope fallback were); (3) `oauthFetch`'s malformed-JSON-despite-
  `application/json`-header fallback (mirrors `apiFetch`'s own equivalent, already tested elsewhere in
  `api.test.ts` — easy to forget to re-test when duplicating the pattern, as it was here).
- Final: 674/674 tests passing, 100% coverage on all four metrics, clean `yarn build`. **This
  completes all four phases of the OAuth wiring plan** (backend routes, admin Client CRUD, public
  consent screen). Not yet done: the plan's own end-to-end manual verification step (register a test
  `Client` via the admin UI, drive the full authorize→consent→token→userinfo flow through a real
  browser or script against a running server) — automated tests give strong confidence but this
  hasn't been exercised against a live deployment. Nothing committed yet at the time this entry was
  written — check current `git status`/history for whether that's since changed.

### 2026-09-05 (later) — Phase C: admin console CRUD UI for OAuth Clients

Built the `apps/admin/oauth-clients/*` screens on top of Phase B's backend wiring, mirroring the
existing Users admin screens file-for-file (list/new/detail pages, table/form/modal components,
`adminApi.ts` functions, `AdminShell` nav link).

- **New `apps/shared/lib/adminApi.ts` exports**: `AdminClient` type, `listClients`/`getClient`/
  `createClient`/`updateClient`/`deleteClient`/`regenerateClientSecret` — same
  `apiFetch`-wrapper shape as the existing `list/get/create/update/deleteUser` functions.
- **New components** under `apps/shared/components/admin/oauth-clients/`: `ClientTable` (mirrors
  `UserTable`), `CreateClientForm` (mirrors `CreateUserForm`), `DeleteClientModal` (mirrors
  `DeleteUserModal`), `ClientOverviewCard` (mirrors `UserOverviewCard` — edit-in-place for name/
  redirect URIs/grant types/response types/scope/firstParty/disabled), `ClientSecretCard` (new —
  the "Regenerate secret" button, only rendered for a `confidential` client), `RevealSecretModal`
  (new — the one-time plaintext-secret display, styled after `TotpSecretForm`'s existing "shown
  once, plain `<code>` text, no copy-to-clipboard" precedent in `apps/shared/components/account/
  secrets/`).
- **New pages**: `apps/admin/oauth-clients.tsx` (list + pagination + delete, no search bar — not
  asked for), `.../new.tsx`, `.../[uid].tsx` (dynamic route segment, `@rapidrest/react` >=2.0.0-beta.0 —
  see `apps/admin/users/[uid].tsx` for the same pattern; superseded the old `?uid=` query-param +
  `readTargetUid()`/SSR-guard workaround once dynamic segments landed).
- **One UX wrinkle `apps/admin/users/new` doesn't have to solve**: a *public* client's
  `createClient()` response never carries a `clientSecret` (none is ever generated for one), so
  `NewOAuthClientPage.handleCreated()` branches — reveal-then-redirect for a confidential client's
  secret, immediate redirect for a public client. Don't assume every "create" response needs the
  reveal-modal treatment when adding a similar flow elsewhere.
- Added the `OAuth Clients` nav link to `AdminShell.tsx` next to the existing `Users` link, and
  extended `AdminShell.test.tsx`'s existing render test to assert on it too rather than adding a
  whole separate test for one link.
- Full test suite added under `test/apps/admin/_components/*.test.tsx` and
  `test/apps/admin/oauth-clients/*.test.tsx`, mirroring the Users equivalents test-for-test
  (including the `detail.ssr.test.tsx` no-`window` guard test). **Three coverage gaps found on the
  first full-suite run** (all "the exact one branch nobody clicked" cases, not logic bugs): the
  `disabled` checkbox's `onChange`, `RevealSecretModal`'s `onClose` handler wired from
  `ClientSecretCard` (never closed once opened, in the original test), and
  `CreateClientForm`'s `client_secret_post` option (only `client_secret_basic`, the default, was
  ever selected). Fixed by adding one targeted test each — same "did the last full-suite run
  actually hit every branch" habit that mattered for Phase A/B too.
- Final: 637/637 tests passing, 100% coverage on all four metrics, clean `yarn build`. Nothing
  committed yet at the time this entry was written — per standing decision, left staged/unstaged
  for review; check current `git status`/history for whether that's since changed.

### 2026-09-05 — Phase B: wired `@rapidrest/auth`'s OAuth 2.0/OIDC authorization server into this app (backend only)

Bumped `@rapidrest/auth` to `^2.0.0-beta.2` (published; see the sibling `auth` repo's own
`.claude/NOTES.md` for how the library-side work — signing keys, `Client` model,
`BaseOAuthClientRoute`, full Authorization Code/PKCE/refresh/client_credentials/revoke/introspect/
discovery/userinfo surface — got there). This session only did the backend wiring (Phase B of the
cross-repo plan); the admin-console CRUD UI (Phase C) and public consent screen (Phase D) are not
started yet.

- **New model re-exports**: `src/sql/Models.ts`/`src/mongo/Models.ts` gained `Client`,
  `AuthorizationCode`, `ConsentGrant`, `OAuthRefreshToken`, `SigningKey` (SQL/Mongo variants),
  matching the existing `export { UserSQL, ... }` shape.
- **New route files** (one per datastore, 8 total): `OAuthAuthorizeRoute`, `OAuthTokenRoute`,
  `OAuthJwksRoute`, `OAuthRevokeRoute`, `OAuthIntrospectRoute`, `OAuthUserInfoRoute`,
  `OAuthDiscoveryRoute`, `OAuthClientRoute`, all under `src/{sql,mongo}/routes/`.
- **Important routing decision: used the bare `@Route(...)` decorator, NOT `@ApiRoute(...)`, for
  every protocol-mandated OAuth/OIDC endpoint** (`OAuthAuthorizeRoute`, `OAuthTokenRoute`,
  `OAuthJwksRoute`, `OAuthRevokeRoute`, `OAuthIntrospectRoute`, `OAuthUserInfoRoute`,
  `OAuthDiscoveryRoute`). `@ApiRoute` unconditionally prepends `/api` (see
  `RouteDecorators.ApiRoute` in `service-core`) — fine for this app's existing CRUD resources
  (`/api/users`, etc.), but wrong here: `/.well-known/openid-configuration`,
  `/.well-known/oauth-authorization-server`, and `/.well-known/jwks.json` are RFC 5785/8414
  path-mandated to live at the site root, and the other bare `/oauth/*` endpoints need to match what
  the discovery document actually advertises. **`OAuthClientRoute` is the one exception** — it's
  reverted back to `@ApiRoute("/oauth/clients")` (→ `/api/oauth/clients`), added during Phase C.
  Unlike the others, `Client` CRUD isn't a spec-mandated endpoint at all (RFC 6749/8414 never
  mention client-management) — it's an ordinary admin/owner-managed REST resource whose only
  consumer is this app's own admin console via `apiFetch()`, which (a) hardcodes the `/api` prefix
  (see its own doc comment: "`path` is the route as declared by `@ApiRoute`") and (b) is what gives
  every call its transparent `@RequiresElevation` retry handling — `BaseOAuthClientRoute`'s
  mutating endpoints all carry that decorator, so reaching it any other way would silently lose
  step-up re-auth handling in the admin UI. **If a future OAuth-surface route is added here: use
  bare `@Route(...)` for a real protocol endpoint, `@ApiRoute(...)` for an admin-only management
  resource like this one.**
- Only `OAuthAuthorizeRoute` and `OAuthDiscoveryRoute` needed any code beyond a one-line class
  binding: the former sets `resourceOwnerStrategies = ["jwt"]` (sufficient on its own — any
  successful sign-in this app supports, including a federated Google/Microsoft/Apple/Facebook
  login, already populates the session `resolveUserUid()`'s fast path reads); the latter overrides
  `endpoints` as a getter built from `this.issuer` (itself `@Config`-injected by the base class),
  since TS allows an accessor to satisfy an abstract property. Every other new file is a one-line
  `@Route(path) class X extends BaseXRouteSQL/Mongo {}` binding — the SQL/Mongo split classes
  upstream already bind every model-class abstract field.
- **New config**: `auth:oauth_server` block added to both `config.sql.ts`/`config.mongo.ts` (right
  after the existing `totp` block, alongside the other `auth:*` provider blocks) —
  `issuer` (default `http://localhost:3001`, matching `rapidrest dev`'s first-choice port; must be
  overridden to the real deployment origin), `keys.{encryption_key,rotationIntervalDays,
  retirementGraceDays}`, `codeTTL`/`consentTicketTTL`/`accessTokenTTL`/`idTokenTTL`/
  `refreshTokenTTL`, `supportedScopes`. **Verified every one of these config key names/shapes by
  reading the installed `@rapidrest/auth` package's own compiled source/`.d.ts` files directly**
  (`grep -n "@Config" node_modules/@rapidrest/auth/dist/lib/**/*.js`) rather than trusting the
  original cross-repo plan's speculative names — this caught that the plan's guessed
  `pendingRequestTTL`/`dynamicRegistration.*` keys don't actually exist (the real key is
  `consentTicketTTL`; dynamic registration is still deferred so has no config surface yet). Do this
  same verification step again for any future `auth:oauth_server:*` key before wiring it in.
- Added `DEFAULT_OAUTH_SERVER_ENCRYPTION_KEY` (a real, checked-in-plaintext 64-hex-char placeholder,
  machine-verified length via `wc -c`/regex before committing to it) to `config.defaults.ts`, and
  added it to `assertProductionSecretsAreSet()`'s **hard-fail** set (same treatment as
  `auth:secret`/`cookie_secret`/`session:secret` — this is real key material, not a third-party
  placeholder like the OAuth provider credentials, which only warn).
- No seed job added for a first `Client` — Phase C's admin UI will be how the first one gets
  created, same as this app's existing admin *user* seeding is sufficient to reach the admin
  console today.
- **Coverage gap found and fixed**: `OAuthDiscoveryRoute`'s `endpoints` getter was never exercised
  by any existing test (`Server.sql.test.ts`/`Server.mongo.test.ts` prove routes register/start
  cleanly, but never call this specific endpoint) — added
  `test/OAuthDiscoveryRoute.{sql,mongo}.test.ts`, isolated unit tests in the same style as
  `test/AuthGoogleRoute.sql.test.ts`, asserting the exact URLs built from a manually-set `issuer`.
  Full suite: 568/568 passing, 100% coverage on all four metrics after this fix.
- Did not do a live manual `server.sql.ts`/`server.mongo.ts` run + curl against
  `/.well-known/openid-configuration`/`jwks.json` (the plan's own suggested verification step) —
  `Server.sql.test.ts`/`Server.mongo.test.ts` already start a real in-process server with every new
  route registered via the real `ObjectFactory`/`ClassLoader` path (against sqlite + a fake-Redis,
  not real infra) and pass cleanly, which already rules out the failure mode a manual run would
  have caught (a missing abstract field or bad `@Config` path throwing at startup). Offered to do
  the live check anyway if asked.
- Nothing committed yet — per standing decision, left staged/unstaged for review.

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

### 2026-08-27 — replaced generic AuthOIDCRoute with Google/Microsoft/Apple-specific routes

- Removed `src/{sql,mongo}/routes/AuthOIDCRoute.ts` (the single generic, config-driven OIDC
  provider) and replaced them with `AuthGoogleRoute`/`AuthMicrosoftRoute`/`AuthAppleRoute` in both
  backends, mounted at `/auth/google`, `/auth/microsoft`, `/auth/apple`.
- **This required an unreleased fix in the sibling `auth` repo.** `@rapidrest/auth@1.0.0`
  (published, what was installed here) hardcoded `BaseAuthOIDCRoute`'s registered strategy name
  to `"oauth"` — mounting more than one OIDC route would have every instance silently clobber the
  same `AuthMiddleware` registration key, so only the last one loaded would actually work. The
  sibling repo already had this fixed on `main` (commit `2bce9ac`, local version bumped to
  `1.1.0`, not yet pushed/published at the time) via a new `protected strategyName` field each
  subclass can override, paired with a documented requirement to also redeclare `login()` with a
  matching `@Auth([strategyName])` (decorator metadata is read from the *declaring* class, not
  re-evaluated per instance, so an unmodified inherited `login()` would still check `"oauth"`
  regardless of `strategyName`). Bumped `package.json` to `"@rapidrest/auth": "^1.1.0"` — per
  Standing decisions above, this is a real registry dependency, not a portal/workspace link, so
  `yarn install` will fail until `1.1.0` is actually published. User (JP) said he'd publish it
  himself; until then this repo won't `yarn install`/build/test clean.
- Each new route defines individual `@Config("auth:<provider>:...")` fields (clientID/
  clientSecret/redirectURI, `tenant` for Microsoft, `teamId`/`keyId`/`privateKey` for Apple)
  rather than one opaque `@Config("auth:<provider>")` object field, and computes `providerConfig`
  as a `get` accessor over those fields. Confirmed safe by reading
  `@rapidrest/core`'s `ObjectFactory.js`: `@Config`-decorated fields are populated in a dedicated
  injection pass that runs before any `@Init` hook fires, so the getter always sees real config
  values by the time the base class's private `@Init initialize()` reads `this.providerConfig`.
  This also sidesteps the fact that `BaseAuthOIDCRoute.initialize()` is `private` (can't be
  overridden from a subclass in a different file) — no need to hook initialization at all.
- Google and Microsoft use the shared `OIDCStrategy`'s standard OpenID + JWKS `id_token`
  verification unmodified; per-provider `profileMap` overrides translate each provider's actual
  id_token claim names (Google: `sub`/`given_name`/`family_name`/`picture`; Microsoft:
  `sub`/`preferred_username` fallback for email) onto the canonical `OIDCProfile` shape — the
  package's `DEFAULT_PROFILE_MAP` assumes claim names (`profile.username`, etc.) that don't match
  any real provider's actual id_token.
- **Microsoft tenant caveat (documented in-code, not solved):** defaulting to the multi-tenant
  `common` authority is fine for the authorize/token endpoints, but Microsoft's id_token `iss`
  claim is tenant-specific even when the request went through `common` — `OIDCStrategy.
  verifyIdToken()` does a strict single-string issuer match, so a real sign-in through `common`
  will fail issuer verification. `auth:microsoft:tenant` must be set to a concrete tenant
  GUID (or `consumers`, whose id_tokens consistently use Microsoft's fixed consumers-tenant GUID
  as `iss`) for production use. `assertProductionSecretsAreSet()` now warns if `tenant` is still
  `common` in production, same treatment as the other placeholder credentials.
- **Apple client_secret is a JWT, not a static secret** — the only provider where this is true.
  Rather than plumbing dynamic secret generation into the shared `OIDCStrategy`/`OIDCProvider`
  (which would couple that generic package to one provider's quirk), `AuthAppleRoute` signs an
  ES256 JWT itself (`iss`=teamId, `sub`=clientID, `aud`="https://appleid.apple.com") in a private
  `getClientSecret()` method called from the `providerConfig` getter, cached and regenerated when
  under an hour from Apple's ~6-month max lifetime. Added `jsonwebtoken`+`@types/jsonwebtoken` as
  direct dependencies (previously only reached transitively via `@rapidrest/auth`'s own use of it
  for id_token verification) since this is now imported directly in this repo's own code.
  Apple also never returns given/family name in the id_token (only once, in a separate `user` POST
  field on first authorization) — deliberately left unmapped rather than reading that extra field,
  since the generic `OIDCStrategy.authenticate()` doesn't surface anything beyond `code`/`state`
  from the callback request today.
- `config.defaults.ts`: replaced `DEFAULT_OIDC_CLIENT_ID`/`DEFAULT_OIDC_CLIENT_SECRET` with
  per-provider placeholder constants (`DEFAULT_GOOGLE_*`/`DEFAULT_MICROSOFT_*`/`DEFAULT_APPLE_*`),
  including a syntactically-valid-but-public EC private key as the Apple placeholder so
  `jwt.sign()` doesn't throw before an operator configures a real one. Extended
  `assertProductionSecretsAreSet()`'s warning list accordingly (same warn-not-throw treatment as
  before — these routes are always mounted regardless of whether any given provider is in use).

### 2026-08-27 (same session) — wired the Google/Microsoft/Apple routes to the sign-in page

**SUPERSEDED the same session — see the later "refactored OAuth callback handling onto the
frontend" entry below.** JP explicitly rejected the redirect-URI-points-at-the-API design this
entry describes: he wants the provider redirecting back to the *sign-in page*, which forwards the
code to the API itself via `fetch`, so OAuth error handling goes through React's normal
try/catch/Alert path like every other sign-in method instead of the browser landing on a raw JSON
response. Left the reasoning below intact as a record of what was tried and why it didn't hold up
— don't re-derive this same "point redirectURI at the API route" design from scratch, it's a dead
end for exactly the error-handling reason above.

- **No frontend callback page needed — this is the key design decision.** `login()` on each of
  the three OIDC routes only ever runs *after* `@Auth([strategyName])` has already driven
  `OIDCStrategy.authenticate()` to a successful code exchange: the "no `code` yet, redirect to the
  provider" branch inside `authenticate()` returns `undefined` and ends the response itself, which
  (confirmed by reading `RouteUtils.js`'s dispatch wrapper) short-circuits the middleware chain
  before the route handler is ever invoked. So `login()` genuinely has no "plain API call" case to
  support for these three routes — every invocation means a sign-in just completed. Each
  `login()` override now does `await super.login(user, req, res)` (mints the AuthResult, which
  sets the `jwt`/`refresh` cookies as a side effect via `TokenUtils.createAuthResult` — the
  return value itself is discarded) and then manually redirects with
  `res.status(302); res.setHeader("Location", "/account"); res.setHeader("Content-Length", 0); res.end();`,
  returning `undefined`. Confirmed safe against `RouteUtils.js`'s post-handler response logic: it
  unconditionally calls `res.send()`/`next()` after the handler returns regardless of what the
  handler returned, but every adapter's `end()`/`send()` is guarded by `_writableEnded` and is a
  no-op once already called — exactly the same pattern `OIDCStrategy` itself already relies on for
  its own manual redirect. `@Returns` was updated from `[AuthResult, undefined]` to `[undefined]`
  and the `AuthResult` import dropped from all 6 route files, since JSON is never actually the
  real response anymore.
- `redirectURI` config defaults (both `config.sql.ts`/`config.mongo.ts` and each route's own
  `@Config` default) changed from the bare origin (`http://localhost:3000`) to the backend route
  itself (`http://localhost:3000/api/auth/google`, etc.) — the same URL serves both legs of the
  OAuth dance (initiate + provider callback), so there was never a reason to route through a
  separate frontend page at all.
- Frontend: `apps/shared/components/sign-in/steps/IdentifierStep.tsx`'s two disabled placeholder
  buttons ("Continue with Google"/"Microsoft", `disabled`, plus a "isn't configured" hint) are now
  live — `onClick` does a real top-level `window.location.href = "/api/auth/<provider>"`
  navigation (NOT an `apiFetch`/`fetch` call — the browser needs to actually follow the provider's
  redirect chain and land back on a real page, not receive a JSON response body it can't act on).
  Added a third "Continue with Apple" button, same pattern. Deliberately kept these as plain text
  buttons with no brand icon: `react-icons` (already a dependency) ships Simple Icons (`SiGoogle`,
  `SiApple`) but has **no Microsoft mark at all** (removed from Simple Icons over trademark
  policy) — icons for 2 of 3 providers but not the third would look broken, so all three stayed
  icon-less rather than introducing that inconsistency.
- **Known, accepted gap: OAuth failures show a raw JSON error page, not a friendly one.** Provider
  errors (`?error=access_denied`), CSRF/state mismatches, and token-exchange failures are all
  thrown from *inside* `OIDCStrategy.authenticate()`, which runs as `@Auth` middleware **before**
  `login()` — so a route-level `login()` override has no opportunity to catch them and redirect to
  `/auth/signin` with a nice message the way every other sign-in method's `try/catch` does. Fixing
  this would need route-level (or global) error-handling middleware wired into the `@Auth`
  decorator's dispatch, which is real framework-level scope beyond "wire up the button" — left
  alone deliberately, same as the Microsoft-tenant-issuer and Apple-given/family-name gaps above.
- Test: `test/apps/auth/signin.test.tsx`'s old "renders disabled OAuth buttons" test became
  "renders enabled OAuth buttons for every provider"; added a new `describe("SignInPage — OAuth
  buttons")` block asserting each button click sets `location.href` to its `/api/auth/<provider>`
  endpoint (via the existing `mockLocation()` helper — no new test infra needed).
- Caught and fixed my own mistake while writing the *previous* entry in this file: an `Edit`
  truncated the pre-existing "Tooling note" bullet mid-sentence and its continuation ended up
  orphaned as a dangling fragment at the very end of the file instead of completing that sentence.
  Reattached it. **Lesson: when appending to a file via `old_string` matching, double check the
  matched boundary doesn't split content the edit didn't mean to touch** — a truncated bullet with
  no visible syntax error is easy to miss without rereading the surrounding lines.

### 2026-08-27 (same session) — added Facebook as a fifth OIDC/OAuth provider

- Added `AuthFacebookRoute` (SQL + Mongo) and a fourth "Continue with Facebook" button, following
  the exact same `strategyName`/`login()`-redirect pattern established for Google/Microsoft/Apple
  earlier this session — see those entries above for the shared architecture (per-provider
  strategy name + matching `@Auth([...])`, `login()` redirects to `/account` instead of returning
  JSON, `redirectURI` points at the route's own backend URL).
- **Facebook Login is plain OAuth 2.0, not OpenID Connect** — no id_token, no JWKS, no `issuer`.
  `providerConfig.protocol` is set to `"oauth2"` (not `"openid"`) specifically so
  `OIDCStrategy.retrieveUserProfile()` skips the id_token-verification branch entirely and always
  fetches `profileURL` instead. Facebook's Graph API accepts the access token via a standard
  `Authorization: Bearer` header (it returns `token_type: "bearer"` from its token endpoint),
  which is exactly what `OIDCStrategy` already sends unconditionally — no code changes needed
  anywhere in `@rapidrest/auth` for this provider, unlike Apple's JWT client_secret quirk.
- `profileURL` is the Graph API `/me` endpoint with an explicit `fields=` query string
  (`id,name,email,first_name,last_name,picture`); a `GRAPH_API_VERSION = "v21.0"` constant is
  interpolated into all three Facebook URLs (authorize/token/profile) since Facebook requires (and
  eventually deprecates) explicit API versions — bump that one constant when it nears
  deprecation. `picture` comes back as a nested `{ data: { url, ... } }` object from Graph API
  (there's no bare-URL field), so the `profileMap`'s `avatar` entry is
  `"profile.picture?.data?.url"` rather than a flat property access like the other providers.
  `email_verified` is inferred as `!!profile.email` — Facebook only ever returns an `email` claim
  for an account with a verified address, so its mere presence already implies verified (same
  reasoning already used for Microsoft's `preferred_username` fallback).
- No PKCE configured for Facebook (`pkce` left unset), unlike the other three providers — this is
  a confidential client already authenticating via `clientSecret`/Basic-auth at the token
  exchange, and Facebook's PKCE support for the traditional server-side Login dialog isn't as
  consistently documented/tested as Google/Microsoft/Apple's, so it was left out rather than
  asserting confidence in something unverified. Low risk either way since unrecognized query
  params are normally just ignored by OAuth authorization servers, but no reason to add unverified
  surface area for no benefit.
- No new dependencies — Facebook needs no JWT signing (unlike Apple) and no JWKS client (unlike
  Google/Microsoft), just the same `axios`-based profile fetch already used for any `profileURL`
  provider.
- Kept the frontend button icon-less like the other three, for the same reason recorded in the
  previous entry (`react-icons`'s Simple Icons set has `SiFacebook` but not `SiMicrosoft` —
  inconsistent partial icon coverage would look worse than none). **Superseded later the same
  session** — JP asked for real icons on all four buttons, so hand-rolled inline SVG brand marks
  were added instead of relying on `react-icons` at all; see the "added real SVG brand icons"
  entry below.
- Extended `config.defaults.ts`'s placeholder-credential warning list and both
  `test/config.defaults.test.ts` and `test/apps/auth/signin.test.tsx` the same way as the other
  three providers (new `DEFAULT_FACEBOOK_CLIENT_ID`/`DEFAULT_FACEBOOK_CLIENT_SECRET`, a new
  enabled-button assertion, a new click-navigates-to-`/api/auth/facebook` test).

### 2026-08-27 (same session) — refactored OAuth callback handling onto the frontend, added real SVG brand icons

JP rejected the earlier same-session design (routing the provider's redirect straight back to the
API route, with `login()` issuing a raw 302 to `/account`) — see the SUPERSEDED marker on that
entry above for his exact reasoning. This entry replaces it for all four providers
(Google/Microsoft/Apple/Facebook, SQL+Mongo — 8 route files).

- **`redirectURI` now points at the frontend sign-in page** (`http://localhost:3000/auth/signin`),
  not the backend API route — identical value across all four providers' configs is fine since
  redirect_uri matching is scoped per-provider-app, not global.
- **`login()` reverted to the original simple pass-through** (`return super.login(user, req,
  res);`), `Promise<AuthResult | undefined>` restored as the return type, `@Returns([AuthResult,
  undefined])` and the `AuthResult` import restored in all 8 route files. The provider→API-route
  redirect trick and its manual `res.status(302)/setHeader/end()` dance are gone entirely — `login()`
  now behaves exactly like every other sign-in route in this codebase (`/auth/mfa`, `/auth/passkey`,
  etc.): it returns JSON, the framework serializes it, done. This is *why* the fix eliminates the
  "known, accepted gap" from the previous entry (raw JSON error pages on OAuth failure) — the
  frontend now owns the whole request/response, so a thrown `ApiError` from
  `OIDCStrategy.authenticate()` surfaces as a normal `ApiRequestError` through `apiFetch`, exactly
  like a failed password or OTP attempt.
- **The hard problem this design has to solve: the frontend doesn't know which provider a
  returning `?code=...` belongs to**, since all four now share one `redirectURI`. First pass used
  `sessionStorage` to remember the provider across the round trip; JP correctly pushed back on this
  — round-tripping app data through the OAuth `state` param is literally what `state` is for, per
  spec (RFC 6749 §4.1/§10.12), so reach for that before reaching for extra client-side storage.
  Final design: `handleOAuthSignIn(provider)` does `window.location.href =
  "/api/auth/<provider>?state=<provider>"` — `OIDCStrategy.buildAuthorizationURI` (in
  `@rapidrest/auth`) reads that `state` query param as the "client app data" half, combines it with
  its own CSRF token into `<csrfToken>.<provider>`, and hands the combined value to the OAuth
  provider, which echoes it back unchanged on its own redirect (for both success *and* error
  redirects — RFC 6749 §4.1.2.1). `SignInFlow.tsx`'s local `extractProviderFromState(state)` helper
  recovers `provider` by splitting on the first `.` — safe because the CSRF half is always a
  `crypto.randomBytes(...).toString("base64url")` value, and base64url's alphabet (RFC 4648 §5)
  never contains a literal `.`. No sessionStorage, no extra constant to share between files, no
  multi-tab edge case to worry about — the whole round trip is stateless from the frontend's
  perspective. Don't reintroduce sessionStorage/localStorage for this if it comes up again.
- **New `Step = "oauth"` and `OAuthCallbackStep.tsx`** (`apps/shared/components/sign-in/types.ts` /
  `steps/`): `SignInFlow` runs a mount-only `useEffect` (empty dep array — deliberately a one-time
  check of whatever URL this mount inherited, not a reactive effect) that: (1) no-ops immediately
  if neither `code` nor `error` is in `location.search` (covers every normal page load, including
  all pre-existing tests, which don't set either) (2) scrubs `code`/`state` from the URL via
  `history.replaceState` *before* anything else, so a refresh/copied link can't replay an
  already-consumed code, (3) recovers the provider from `state` per above, (4) switches to the
  `"oauth"` step and either calls the new `completeOAuthSignIn(provider, search)` (in
  `apps/shared/lib/api.ts` — a thin `apiFetch` wrapper forwarding the full original query string to
  `/auth/<provider>`) on success invoking the same `onSuccess` prop every other method uses, or (if
  `state` had no provider to recover — e.g. missing, or no `.` in it) shows a fixed "Sign-in could
  not be completed" error immediately without ever calling the API.
- Capture `search` into a local `const` at the very top of the effect, *before* calling
  `history.replaceState` — reading `window.location.search` again afterward would read back the
  already-scrubbed empty string. Got this right on the first pass but flagging it since it's the
  one-line bug most likely to reappear if this effect is ever restructured.
- Testing note for future sessions: `mockLocation()` (`test/apps/testUtils.ts`) doesn't include
  `search`/`pathname`, which is fine for every *other* test (an absent `.search` makes
  `new URLSearchParams(undefined)` — empty, safe, matches "no OAuth callback in progress") but not
  enough to simulate an *incoming* callback. Added a local `mockOAuthCallbackLocation(search)`
  helper in the new `describe("SignInPage — OAuth callback")` block (not lifted into the shared
  `testUtils.ts` — it's one-test-file-specific enough not to warrant it yet) that extends the same
  swapped-plain-object trick with `pathname`/`search`, plus `vi.spyOn(window.history,
  "replaceState")` (the real jsdom `History` object is untouched by swapping `window.location`, so
  it needs its own stub or the effect's `replaceState` call has nothing meaningful to act on in a
  test).
- **Added real inline SVG brand icons to all four buttons** (JP asked for this after the callback
  refactor was in), in a new `steps/OAuthIcons.tsx` (`GoogleIcon`/`MicrosoftIcon`/`AppleIcon`/
  `FacebookIcon`). Deliberately hand-rolled inline SVG rather than pulling from `react-icons` (a
  dependency already used elsewhere for Feather icons) — its Simple Icons set covers Google/Apple
  but has no Microsoft mark at all (removed over trademark policy), and partial icon coverage
  across a button row would look broken, which is exactly the reasoning that led to *no* icons at
  all two entries ago. Each icon is `aria-hidden="true"` so the button's accessible name stays just
  the visible label text (`getByRole("button", { name: "Continue with Google" })` etc. in tests
  needed no changes) — `.rr-button`'s existing `display:flex; gap:0.5rem` handles icon+label
  layout with no new CSS. `IdentifierStep`'s four near-identical `<Button>` blocks were also
  collapsed into one `OAUTH_PROVIDERS.map(...)` (id/label/icon triples) while making this change.

### 2026-08-27 (same session) — `jwt.sign is not a function` crash in Docker: `import * as jwt` vs `import jwt`

JP reported the production/Docker container (built via the repo's actual `Dockerfile`, which runs
`node dist/src/server.js` directly — no `tsx`/`vitest`/bundler in between) crashing on startup with
`TypeError: jwt.sign is not a function` inside `AuthAppleRoute`. **This never reproduced in any
test or `tsc --noEmit` run this whole session** — the root cause is a genuine gap between how
`vitest` (esbuild-based CJS interop, lenient) and plain Node's native ESM loader (strict,
`cjs-module-lexer`-based static analysis of named exports) resolve `import * as ns from
"<cjs-package>"` for `jsonwebtoken` specifically.

- **Confirmed empirically** (`node --input-type=module -e "import * as jwt from 'jsonwebtoken'; ..."`,
  run directly, not through any test runner): the resulting namespace only has `decode`, `default`,
  and `module.exports` as keys — `sign` and `verify` are both `undefined` on the namespace itself,
  while `jwt.default.sign`/`jwt.default.verify` work fine. `import jwt from "jsonwebtoken"`
  (default import) always resolves to the full CJS `module.exports` object regardless of how well
  the named exports were statically analyzed — that's the fix, applied everywhere this pattern
  appeared: `src/{sql,mongo}/routes/AuthAppleRoute.ts` here (`jwt.sign`, called eagerly from the
  `providerConfig` getter, which runs during the `@Init` startup hook — this is *why* it crashed
  the whole server on boot rather than only failing on an actual Apple sign-in attempt), and
  **`@rapidrest/auth`'s own `src/auth/OIDCStrategy.ts`** (`jwt.decode`/`jwt.verify`, used by
  `verifyIdToken()` for every OpenID provider's id_token verification — Google, Microsoft, and
  Apple all hit this, just lazily, only on an actual completed sign-in rather than at startup,
  which is presumably why it hadn't been reported yet).
- **This is the second `@rapidrest/auth` bug found and fixed at the source this session** (see the
  strategy-name-collision entry above for the first) — per the standing decision, fixed in the
  sibling repo, not worked around only in `auth-server`. Initially also bumped `@rapidrest/auth`'s
  own `package.json` version (`1.1.1`) and this repo's dependency constraint to match — JP said not
  to do that ("there's a formal process for that and your change causes conflicts"), so both were
  reverted back to `1.1.0`/`"^1.1.0"`. See the new standing decision above this Session Log for the
  rule going forward: leave version bumps and publishing to JP entirely, in every `@rapidrest/*`
  sibling repo, not just this one. The source fix itself is still in place either way — only the
  version number/publish step is his to do.
- Verified via the exact same "run compiled output under plain `node`, not vitest" methodology
  that surfaced the bug in the first place — `tsc --noEmit` and `vitest run` alone would not have
  caught this fix either, since both are lenient the same way the original bug's test coverage was.
  **Lesson for future sessions: a fix for a Node-native-ESM-vs-CJS-interop bug must be verified by
  actually running compiled `dist/` output under plain `node`, never just `tsc --noEmit`/`vitest`**
  — confirmed by literally reproducing "works in vitest, fails in node" side-by-side for this exact
  import.
- Checked `@rapidrest/auth`'s test suite (`vitest run`) for regressions from the `OIDCStrategy.ts`
  import fix: `test/routes/sql/AuthOIDCRoute.test.ts` run in isolation has byte-identical
  pass/fail sets before and after (diffed test names, not just counts) — the fix introduces no
  regressions. Running the *full* suite (`yarn vitest run`, no path filter) shows large numbers of
  pre-existing, unrelated failures in this sandbox (~367/1496, e.g. `UserRoute.test.ts` asserting
  403 and getting 404 — routes not mounting, most likely a missing real Postgres/Mongo/Redis
  service in this environment) that reproduce identically on unmodified `main` too (confirmed via
  `git stash`) — pre-existing environmental gap in this sandbox specifically, not something this
  session broke, and out of scope to chase down for an unrelated one-line import fix.
- Searched the rest of `@rapidrest/auth`'s `src/` for the same `import * as x from "jsonwebtoken"`
  pattern — this was the only occurrence.

### 2026-08-28 — third `@rapidrest/auth` bug: `ObjectFactory.newInstance(OIDCStrategy, {name: "default"})` collapsed every provider onto the first one

JP reported every OAuth provider (not just one) failing at request time with `api-101 "No
authentication strategy has been registered with name: google"` (etc.) after the previous two
fixes were published as `1.1.1`. Root cause: `BaseAuthOIDCRoute.initialize()` created each
provider's `OIDCStrategy` via `this._objectFactory.newInstance(OIDCStrategy, { name: "default",
args: [options] })` — a **hardcoded literal `"default"`**, not `this.strategyName`.
`ObjectFactory.newInstance()` (in `@rapidrest/core`) special-cases the literal name `"default"` as
"give me *the* singleton instance of this class" (see its own doc comment at
`ObjectFactory.ts:399-407`) — so whichever provider route's `initialize()` ran first got a real new
`OIDCStrategy`, and every subsequent provider's `initialize()` silently got back that same shared
instance instead of constructing its own, then registered that (wrong) strategy under its own
`strategy.name` — meaning only the first-initialized provider's name ever actually resolved.
- **Fix**: `name: this.strategyName` instead of `name: "default"` — this also matches
  `strategyName`'s own default (`"oauth"`), so the single-provider case is unaffected.
- **This is why the existing "multi-provider strategyName" tests never caught it**: they each
  construct their own separate `makeMockObjectFactory()` per route, and that mock's
  `newInstance(OIDCStrategy, ...)` unconditionally returns `new OIDCStrategy(...)` regardless of
  `name` — it doesn't reproduce `ObjectFactory`'s real singleton-fallback caching at all. Added a
  new regression test using a **real** `ObjectFactory` shared across two route instances (matching
  how `Server`'s `ClassLoader` actually wires things up) — confirmed it fails without the fix
  (`strategies.size` was `1`, not `2`) and passes with it, by literally reverting the fix locally,
  running the test, and restoring it (same verification discipline as the `jwt.sign` fix).
- **Third `@rapidrest/auth` bug found and fixed at the source this session** (see the two entries
  above). Left the version field untouched per the standing decision — this is JP's to version and
  publish.

### 2026-08-28 (same session) — moved OAuth *initiation* into React too, not just the callback

JP: *"Instead of redirecting the user to the oauth API endpoint (to then get redirected to the
oauth provider), the react client should be making the request itself to the API endpoint to
retrieve the redirect URL. That way if there's an error, it can render it properly in react. This
is now the second time you've tried to short circuit proper handling in react."* This is
**feedback to internalize broadly** (saved to global memory too, not just here — see
`feedback_react_owns_navigation.md`): any time a user-initiated action might fail, route it through
a `fetch`/React state update first, even if a plain `window.location.href` to a backend route would
technically work — a raw navigation to a route that can itself error/redirect leaves the browser
stranded on an unstyled response with no chance for the UI to react. The *callback* leg of an OAuth
flow is the one unavoidable exception (the provider's own redirect has to be a real browser
navigation this app doesn't control), but the *initiation* leg is entirely under this app's own
control and has no excuse not to go through `fetch` first.
- **First implementation** used a new `BaseAuthOIDCRoute.authorize(req)` endpoint
  (`GET /auth/<provider>/authorize`) that looked up the registered strategy and called a
  newly-`public` `buildAuthorizationURI(req)` directly. **Superseded within the same session** — see
  the next entry below: JP added a simpler mechanism upstream (`no_redirect=true`) that reuses the
  existing `login()` endpoint instead, so this dedicated route was removed again. Left this note as
  a record of the path not taken; don't re-add a separate `/authorize` sub-route.
- **Frontend**: `apps/shared/lib/api.ts` gained `getOAuthAuthorizeURL(provider, state)` (→
  `GET /auth/<provider>?no_redirect=true&state=...` as of the entry below; originally
  `/auth/<provider>/authorize?state=...`). `SignInFlow.handleOAuthSignIn` is now `async`: fetches
  the URL, and only does `window.location.href = url` on success — a failure throws the same
  `ApiRequestError` every other sign-in method already handles via `err instanceof ApiRequestError ?
  err.message : "Something went wrong..."`, rendered inline on the identifier step via the existing
  `error`/`Alert` state, exactly like a failed `discoverAuthMethods` call. Added
  `oauthLoadingProvider` state (which provider's fetch is in flight) so `IdentifierStep` can show a
  spinner on that one button and disable the other three during the round trip — mirrors the
  existing `discoverLoading`/`Continue` button pattern. `extractProviderFromState` and the
  callback-side `useEffect` in `SignInFlow.tsx` are **completely unchanged by any of this** —
  `redirectURI` is still the frontend sign-in page, `state` still round-trips the provider name the
  same way, and the callback leg's code was never the problem here.
- Old direct `window.location.href = "/api/auth/<provider>?state=..."` navigation is gone from
  `handleOAuthSignIn` entirely — every "Continue with ..." click now goes through `apiFetch` first.
- This depends on an unpublished sibling-repo change — same "land the fix, leave the version alone,
  JP publishes when ready" workflow as the last two fixes.

### 2026-08-28 (later) — swapped the custom `/authorize` endpoint for `OIDCStrategy`'s own `no_redirect=true`

JP added `no_redirect=true` support directly to `@rapidrest/auth`'s `OIDCStrategy.authenticate()`
himself and flagged it as a possible replacement for the `authorize()` endpoint from the entry
above. Adopted it and removed the custom endpoint — it's strictly simpler:
- `OIDCStrategy.authenticate()` now checks `req.query?.no_redirect === "true"` on the no-`code`
  branch: `true` → `res.status(200); res.json({ url })` instead of the `302`/`Location` redirect.
  Since it still returns `undefined` and writes the response itself either way, this goes through
  the **exact same** `@Auth([strategyName]) login()` entry point every provider route already had
  — no new route, no manual `authMiddleware.strategies.get(...)` lookup, no per-provider anything.
  `buildAuthorizationURI` reverted from `public` back to `protected` (nothing outside the class
  calls it anymore) and `BaseAuthOIDCRoute.authorize()`/`OIDCAuthorizeResult` were deleted entirely,
  along with their 4 tests in `test/routes/BaseAuthOIDCRoute.test.ts` (upstream `auth` repo).
- `auth-server`'s only change: `getOAuthAuthorizeURL()` now fetches
  `/auth/<provider>?no_redirect=true&state=...` instead of `/auth/<provider>/authorize?state=...`.
  No route files changed here at all — every provider's existing `login()` override already had the
  right `@Auth([strategyName])` wiring, which is all `no_redirect` needed to piggyback on.
  `SignInFlow.tsx`/`IdentifierStep.tsx` needed zero changes — `getOAuthAuthorizeURL`'s signature
  didn't change, only its internal URL.
- Added `test/apps/_lib/api.test.ts`'s own direct `mockFetch`-level tests for
  `getOAuthAuthorizeURL`/`completeOAuthSignIn` (asserting the exact query string sent) — these two
  functions had **no** direct test coverage before this, only indirect coverage via
  `signin.test.tsx`'s mocked-function-level tests, which wouldn't have caught a wrong URL/query
  construction. Follow the existing `discoverAuthMethods` test in that file as the template for any
  future `api.ts` function that builds its own query string.
- Net effect: **one query param on an existing endpoint**, not a whole extra route, for the same
  outcome. If a similar "give me data instead of a redirect" need comes up elsewhere in this
  codebase, prefer extending the existing auth-flow endpoint with an opt-in query param over adding
  a parallel endpoint, when the underlying strategy/middleware already do the right thing modulo
  the redirect-vs-JSON response format.
