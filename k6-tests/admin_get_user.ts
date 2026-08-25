import http from 'k6/http';
import { check } from 'k6';
import { login, elevateWithPassword } from './login.ts';

export const options = {
  vus: 200,
  duration: '60s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  admin_name: __ENV.admin_name || 'admin',
  admin_password: __ENV.admin_password || '',
};

export function getUser(url: string, authToken: string, uid: string) {
  const headers = { 'Authorization': `jwt ${authToken}` };
  const res = http.get(url + '/users/' + encodeURIComponent(uid), { headers });
  check(res, { 'status is 200': (res) => res.status === 200 });
  return res.body;
}

/**
 * Signs in as `admin`, elevates (see `elevateWithPassword()` in `login.ts` — `GET /users/:id` 403s
 * without a trusted role, which a plain sign-in token doesn't carry), and resolves its own uid, all
 * exactly once for the whole run (see `admin_list_users.ts` for why this can't happen per-VU: `/auth/mfa`
 * rate-limits an identifier to 5 attempts per 5 minutes, and there's only one `admin` account to sign in
 * as). There's no fixed, known-in-advance uid for the default admin account (its `name` alias is the
 * configured "admin", but `User.uid` is a generated id), so the target for this GET-by-uid load test is
 * learned from the account itself via `GET /users/me`.
 */
export function setup(): { authToken: string; targetUid: string } {
  if (!config.admin_password) {
    throw new Error("Set the 'admin_password' env var (-e admin_password=...) to the admin account's password.");
  }
  const plainToken = login(config.url, config.admin_name, config.admin_password);
  const authToken = elevateWithPassword(config.url, plainToken, config.admin_password);
  const res = http.get(config.url + '/users/me', { headers: { 'Authorization': `jwt ${authToken}` } });
  check(res, { 'setup: GET /users/me status is 200': (res) => res.status === 200 });
  const targetUid: string = JSON.parse(res.body!.toString()).uid;
  return { authToken, targetUid };
}

export default function (data: { authToken: string; targetUid: string }) {
  getUser(config.url, data.authToken, data.targetUid);
}
