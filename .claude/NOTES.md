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

## Session Log

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
