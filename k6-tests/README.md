# k6 load tests

Standalone [k6](https://k6.io/) scripts (no npm/build wiring — run each directly with `k6 run`), modeled on
the `k6-tests/` layout in the `petstore_example` reference project: each file exports `options` (the
executor/VU shape), `config` (`__ENV`-driven, so every value below is overridable with `-e key=value`), a
reusable exported function doing the actual HTTP call, and a `default` (or `setup`/`default`) entry point.

## Why this suite isn't a 1:1 copy of petstore's

Petstore's own auth is a simple, unthrottled `name`+`password` login with no rate limiting, so every one of
its scripts can safely have every VU sign in as the same account. `auth-server` deliberately rate-limits
`POST /auth/mfa` to 5 attempts per identifier per 5 minutes (see `RateLimiter` in `@rapidrest/auth`) and
requires a separate elevation step (`POST /auth/elevation`) before a token carries any trusted role (see
`@RequiresElevation()` on admin-only routes) — both correct, deliberate security behavior, confirmed
firsthand while building this suite (naively porting petstore's "every VU logs in as the shared account"
pattern immediately self-DoS'd the rate limiter). This suite works around both:

- **Self-service scripts** (`get_profile.ts`, `list_secrets.ts`, `list_aliases.ts`, `get_www_account.ts`,
  `refresh_token.ts`) sign in as one of a *pool* of accounts `setup.ts` provisions ahead of time — see
  `testUsers.ts`. Each VU deterministically picks a different pool member (via k6's `__VU`), spreading the
  one-time-per-VU login across many identities instead of hammering one.
- **Admin-only scripts** (`admin_list_users.ts`, `admin_get_user.ts`, `admin_create_user.ts`,
  `get_metrics.ts`) sign in and elevate as the single `admin` account exactly once per run, via k6's
  `setup()` lifecycle hook (runs once regardless of VU count), and hand the resulting elevated token to
  every VU. There's only one admin account, so this can't be spread across a pool the way self-service
  logins are.

## Prerequisites

1. **A running server** — via Docker Compose (`docker-compose build && docker-compose up`) or otherwise.
2. **A known admin password.** By default `DefaultAccounts` generates a random one-time password and
   writes it to the `passwords` file (or the log, if `auth:password_file` is cleared) — fine for a real
   deployment, useless for a repeatable load-testing setup. Give the admin account a fixed password via
   config instead, e.g. as an environment override:
   ```
   DEFAULT_ACCOUNTS=[{"name":"admin","roles":["admin"],"password":"<a-real-secret>"}]
   ```
   (nconf's `parseValues` JSON-parses a single flat env var like this reliably; overriding just the nested
   `default_accounts:0:password` path via `__`-separated env vars was not reliable in testing — use the
   single-JSON-value form above.) **Never use this for a real production admin account's password** — it's
   a plaintext env var, fine only for a disposable load-testing target.
3. **Run `setup.ts` once** against that server to provision the self-service test-user pool, using the
   *same* `test_password` and (if you override it) `count`/`pool_size` you'll pass to every other script:
   ```
   k6 run -e url=http://<host>/api -e admin_password=<...> -e test_password=<a-throwaway-password> k6-tests/setup.ts
   ```

## Running a script

```
k6 run -e url=http://<host>/api -e admin_password=<...> k6-tests/admin_list_users.ts
k6 run -e url=http://<host>/api -e test_password=<...> k6-tests/list_secrets.ts
```

Every script defaults `url` to `http://localhost:3000/api` (or `http://localhost:3000` for the two `www`
page scripts, which serve HTML, not the `/api`-prefixed JSON surface) and `admin_name` to `admin`. See each
file's own `config` block for its full set of overridable env vars.

**Run against HTTPS for accurate results on `refresh_token.ts` and `get_www_account.ts`.** Both depend on
the `jwt`/`refresh` cookies `POST /auth/mfa` sets, which are `Secure` by default (correctly — see the
comment above `cookie:` in `config.mongo.ts`/`config.sql.ts`). k6's cookie jar correctly refuses to send a
`Secure` cookie back over a plain `http://` connection (confirmed while validating this suite — curl's own
cookie jar does *not* enforce this the same way, which can be misleading if you're spot-checking a flow
with curl instead of k6). Against a plain-HTTP target, `refresh_token.ts`'s refresh call will 401 and
`get_www_account.ts` will render the signed-out shell (still a 200, just not exercising the authenticated
path) — neither is a server bug, both are k6 correctly modeling real browser cookie behavior.

## Scope

Covers: `/status`, `/openapi/{json,yaml}`, `/` and `/auth/signin` (public SSR pages), sign-in (`/auth/mfa`),
`/auth/refresh`, `/account` (authenticated SSR), self-service `/profiles/me`, `/secrets`, `/aliases`,
admin `/users` (list/get/create), `/metrics` (also double-checks it rejects an anonymous caller — see the
`.claude/NOTES.md` session log entry on why that default matters).

**Deliberately out of scope:** self-registration (`/register/start`+`/register/verify`) needs a real
verification code delivered by SMS/email — there's no way for a load-test script to receive one, so it
can't be automated here. MFA/TOTP/FIDO2/passkey challenge-based sign-in has the same problem for the same
reason. OIDC sign-in needs a real third-party IdP.
