import http from 'k6/http';
import { check } from 'k6';
import { login, elevateWithPassword } from './login.ts';

export const options = {
  vus: 50,
  duration: '30s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  admin_name: __ENV.admin_name || 'admin',
  admin_password: __ENV.admin_password || '',
};

/** Signs in and elevates as `admin` (see `elevateWithPassword()` in `login.ts` - `/metrics` is
 * trusted-role-gated, and a plain sign-in token 403s on it) exactly once for the whole run - see
 * `admin_list_users.ts` for why this can't happen per-VU (the per-identifier rate limit on `/auth/mfa`,
 * and there's only one `admin` account). */
export function setup(): { authToken: string } {
  if (!config.admin_password) {
    throw new Error("Set the 'admin_password' env var (-e admin_password=...) to the admin account's password.");
  }
  const plainToken = login(config.url, config.admin_name, config.admin_password);
  return { authToken: elevateWithPassword(config.url, plainToken, config.admin_password) };
}

/**
 * `GET /metrics` requires a trusted role by default (`metrics.authRequired: true` - see the Session Log
 * entry in `.claude/NOTES.md` for why that default matters). This also acts as a lightweight regression
 * check for that: an authenticated admin call must succeed, and an anonymous one must be rejected.
 */
export default function (data: { authToken: string }) {
  const authed = http.get(config.url + '/metrics', { headers: { 'Authorization': `jwt ${data.authToken}` } });
  check(authed, { 'authenticated: status is 200': (res) => res.status === 200 });

  const anonymous = http.get(config.url + '/metrics');
  check(anonymous, { 'anonymous: status is 401 or 403': (res) => res.status === 401 || res.status === 403 });
}
