///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
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

/** Mirrors `listUsers()` in `apps/shared/lib/adminApi.ts` (a fixed page size, a random page each call - see
 * that module's `buildUsersQuery` for the full query-param contract). Run `setup.ts` first against the
 * same server so there's more than one page of accounts to actually page through. */
export function listUsers(url: string, authToken: string) {
  const headers = { 'Authorization': `jwt ${authToken}` };
  const page = Math.floor(Math.random() * 10);
  const res = http.get(url + `/users?limit=25&page=${page}&sort=dateCreated`, { headers });
  check(res, { 'status is 200': (res) => res.status === 200 });
  return res.body;
}

/**
 * Signs in as the trusted `admin` account and elevates (see `elevateWithPassword()` in `login.ts` — a
 * plain sign-in token carries no trusted roles, and `GET /users` 403s without one) exactly once for the
 * whole run, however many VUs `options.vus` spins up - `setup()` (a k6 lifecycle hook, distinct from the
 * per-VU `default()` below) always runs exactly once regardless of VU count, and its return value is
 * handed to every VU's `default()` call. This matters because `/auth/mfa` rate-limits an identifier to 5
 * attempts per 5 minutes (see testUsers.ts): there's exactly one `admin` account, so unlike the
 * self-service scripts in this suite (which spread their per-VU logins across a whole pool of provisioned
 * identities instead), admin-only endpoints can't spread the initial login out at all - it has to happen
 * just once.
 */
export function setup(): { authToken: string } {
  if (!config.admin_password) {
    throw new Error("Set the 'admin_password' env var (-e admin_password=...) to the admin account's password.");
  }
  const authToken = login(config.url, config.admin_name, config.admin_password);
  return { authToken: elevateWithPassword(config.url, authToken, config.admin_password) };
}

export default function (data: { authToken: string }) {
  listUsers(config.url, data.authToken);
}
