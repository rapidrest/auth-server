import { check } from 'k6';
import { uuidv4 } from './uuid.ts';
import { login, elevateWithPassword } from './login.ts';
import { createTestUser } from './setup.ts';

export const options = {
  vus: 200,
  duration: '60s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  admin_name: __ENV.admin_name || 'admin',
  admin_password: __ENV.admin_password || '',
  test_password: __ENV.test_password || 'load-test-password-1',
};

/** Signs in and elevates as `admin` (see `elevateWithPassword()` in `login.ts` - `createTestUser()`
 * creates accounts with `verified: true`, a trusted-role-gated action a plain sign-in token 403s on)
 * exactly once for the whole run - see `admin_list_users.ts` for why this can't happen per-VU (the
 * per-identifier rate limit on `/auth/mfa`, and there's only one `admin` account). */
export function setup(): { authToken: string } {
  if (!config.admin_password) {
    throw new Error("Set the 'admin_password' env var (-e admin_password=...) to the admin account's password.");
  }
  const plainToken = login(config.url, config.admin_name, config.admin_password);
  return { authToken: elevateWithPassword(config.url, plainToken, config.admin_password) };
}

export default function (data: { authToken: string }) {
  const user = createTestUser(config.url, data.authToken, `k6-load-user-${uuidv4()}`, config.test_password);
  check(user, { 'user has a uid': (user) => !!user.uid });
}
