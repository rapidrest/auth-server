import http from 'k6/http';
import { check } from 'k6';
import { currentTestUserName } from './testUsers.ts';

// `per-vu-iterations`/`iterations: 1`, not the `vus`+`duration` shape every other script in this suite
// uses: unlike a plain read endpoint, `POST /auth/mfa` is rate-limited to 5 attempts per identifier per
// 5 minutes (see testUsers.ts), so this script measures the login endpoint's behavior across many
// distinct, freshly-provisioned identities logging in exactly once each - not one identity logging in
// repeatedly, which would just measure how fast the rate limiter kicks in. Keep `vus` here <= the test
// user pool size (`pool_size`/`setup.ts`'s `count`, both default 100) so no identity does more than one
// login.
export const options = {
  scenarios: {
    default: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      maxDuration: '30s',
    },
  },
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  test_password: __ENV.test_password || '',
  pool_size: Number(__ENV.pool_size || 100),
};

/**
 * Signs in via `POST /auth/mfa` (mirrors `signInWithPassword()` in `apps/shared/lib/api.ts`) rather than
 * `GET /auth/password` (Basic auth) — this is the endpoint the real sign-in page actually uses, and it
 * transparently completes without a second factor for any account (like the ones this suite provisions)
 * that has none registered. Relies on k6's per-VU cookie jar to also pick up the `jwt`/`refresh`/session
 * cookies the server sets alongside the returned token, so a script that calls this once and then reuses
 * the same VU for further requests gets cookie-based auth for free in addition to the bearer token.
 */
export function login(url: string, id: string, password: string): string {
  const headers = { 'Content-Type': 'application/json' };
  const res = http.post(url + '/auth/mfa', JSON.stringify({ id, password }), { headers });
  check(res, { 'login: status is 2XX': (res) => res.status >= 200 && res.status < 300 });
  check(res, { 'login: res.body is defined': (res) => res.body !== undefined });
  if (res && res.body) {
    const payload: any = JSON.parse(res.body.toString());
    if (!payload.token) {
      // Either an MFA challenge ({uid, methods}) rather than an AuthResult - this suite only provisions
      // password-only accounts, so a real deployment with `auth:require_mfa` enabled needs a different
      // login script than this one - or (more likely, if this identifier has been used to sign in more
      // than 5 times in the last 5 minutes) a rate-limit rejection wearing the same generic 401 shape as
      // a wrong password, by design (see the adversarial review notes in .claude/NOTES.md).
      throw new Error(
        `Sign-in for '${id}' did not return a token (status ${res.status}) - a second factor, or the ` +
          'per-identifier rate limit (5 attempts/5min - see testUsers.ts), are the likely causes.',
      );
    }
    return payload.token;
  } else {
    throw new Error('Failed to sign in.');
  }
}

/**
 * Elevates a signed-in caller via `POST /auth/elevation` with their password (mirrors
 * `elevateWithPassword()` in `apps/shared/lib/api.ts`) — a plain `login()` token deliberately excludes
 * every trusted role (e.g. "admin") until the caller separately proves their identity again this way; see
 * `@RequiresElevation()` on `BaseAdminRoute`/`AdminConsoleRoute`. Only accepted when the account has no
 * enrolled second factor (true for every account this suite provisions), matching `elevateWithPassword()`'s
 * own doc comment. Needed by any script that calls a trusted-role-gated endpoint (`/users` with
 * `verified`/`roles`, `/admin/*`, `/metrics`) — a plain `login()` token gets a 403 from those.
 */
export function elevateWithPassword(url: string, authToken: string, password: string): string {
  const headers = { 'Content-Type': 'application/json', 'Authorization': `jwt ${authToken}` };
  const res = http.post(url + '/auth/elevation', JSON.stringify({ password }), { headers });
  check(res, { 'elevateWithPassword: status is 2XX': (res) => res.status >= 200 && res.status < 300 });
  if (res && res.body) {
    const payload: any = JSON.parse(res.body.toString());
    if (!payload.token) {
      throw new Error(`Elevation did not return a token (status ${res.status}).`);
    }
    return payload.token;
  } else {
    throw new Error('Failed to elevate.');
  }
}

export default function () {
  if (!config.test_password) {
    throw new Error(
      "Set the 'test_password' env var (-e test_password=...) to the same value passed to setup.ts, " +
        'which must be run against this server first to provision the test user pool.',
    );
  }
  login(config.url, currentTestUserName(config.pool_size), config.test_password);
}
