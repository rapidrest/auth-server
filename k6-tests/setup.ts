///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import http from 'k6/http';
import { check } from 'k6';
import { login, elevateWithPassword } from './login.ts';
import { testUserName } from './testUsers.ts';

export const options = {
  vus: 1,
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  admin_name: __ENV.admin_name || 'admin',
  admin_password: __ENV.admin_password || '',
  // Password given to every provisioned test user - also what test_password_login.ts / other
  // authenticated scripts expect via their own `password` env var.
  test_password: __ENV.test_password || '',
  count: Number(__ENV.count || 100),
};

/**
 * Provisions a single bare, verified, password-protected test account as an admin: `POST /users` (bare
 * account) -> `POST /aliases` (a "name"-type alias, the only alias type that's auto-verified on creation -
 * see `adminApi.ts`'s `createUserAlias` doc comment) -> `POST /secrets` (a password, set directly on the
 * account's behalf). Three calls because this app deliberately has no single "create a fully-usable
 * account" endpoint for an admin to call - registration is a multi-step, credential-agnostic flow by
 * design (see `apps/shared/lib/adminApi.ts` and `CreateUserForm.tsx`, which this mirrors exactly).
 * `adminToken` must be an *elevated* admin token (see `elevateWithPassword()` in `login.ts`) - creating an
 * account with `verified: true` is a trusted-role-gated action, and a plain sign-in token 403s on it.
 */
export function createTestUser(url: string, adminToken: string, name: string, password: string): any {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `jwt ${adminToken}`,
  };

  const userRes = http.post(url + '/users', JSON.stringify({ roles: [], scopes: [], verified: true }), { headers });
  check(userRes, { 'createTestUser: create user status is 2XX': (res) => res.status >= 200 && res.status < 300 });
  if (!userRes.body) {
    throw new Error('Failed to create test user.');
  }
  const user = JSON.parse(userRes.body.toString()).user;

  const aliasRes = http.post(
    url + '/aliases',
    JSON.stringify({ type: 'name', alias: name, userUid: user.uid }),
    { headers },
  );
  check(aliasRes, { 'createTestUser: create alias status is 2XX': (res) => res.status >= 200 && res.status < 300 });

  const secretRes = http.post(
    url + '/secrets',
    JSON.stringify({ type: 'password', data: password, userUid: user.uid }),
    { headers },
  );
  check(secretRes, { 'createTestUser: create password status is 2XX': (res) => res.status >= 200 && res.status < 300 });

  return user;
}

export default function () {
  if (!config.admin_password) {
    throw new Error(
      "Set the 'admin_password' env var (-e admin_password=...) to the default admin account's password " +
        '(see the k6-tests/README.md for how to give it a known value).',
    );
  }
  if (!config.test_password) {
    throw new Error(
      "Set the 'test_password' env var (-e test_password=...) - the password every provisioned test user " +
        'will share, for scripts like get_profile.ts / list_secrets.ts to log in with.',
    );
  }

  const plainToken = login(config.url, config.admin_name, config.admin_password);
  const adminToken = elevateWithPassword(config.url, plainToken, config.admin_password);
  console.log('Signed in and elevated as admin.');

  // Predictable names (testUserName(0..count-1)), not random ones: other scripts (see testUsers.ts) need
  // to compute the same names independently, without setup.ts publishing the list anywhere, so each VU
  // can pick a consistent pool member to sign in as instead of all VUs sharing one identity and
  // immediately tripping the per-identifier rate limit.
  for (let i = 0; i < config.count; i++) {
    const name = testUserName(i);
    const user = createTestUser(config.url, adminToken, name, config.test_password);
    console.log(`Created test user: ${name} (uid=${user.uid})`);
  }

  console.log(`Setup complete: ${config.count} test user(s) created (testUserName(0..${config.count - 1})), ` +
    "each signed in with its name + the 'test_password' env var. Point load scripts at the same " +
    "'test_password' and pass a matching -e pool_size (default 100) so they pick from this same pool.");
}
