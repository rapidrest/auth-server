///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import http from 'k6/http';
import { check } from 'k6';
import { login } from './login.ts';
import { currentTestUserName } from './testUsers.ts';

export const options = {
  vus: 200,
  duration: '60s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
  test_password: __ENV.test_password || '',
  pool_size: Number(__ENV.pool_size || 100),
};

export function getProfile(url: string, authToken: string) {
  const headers = { 'Authorization': `jwt ${authToken}` };
  const res = http.get(url + '/profiles/me', { headers });
  // 404 is a valid outcome (see `getProfile()` in `apps/shared/lib/api.ts`) - a freshly-provisioned
  // account (e.g. from setup.ts) has no Profile yet.
  check(res, { 'status is 200 or 404': (res) => res.status === 200 || res.status === 404 });
  return res.body;
}

let authToken: string | undefined = undefined;

export default function () {
  if (!config.test_password) {
    throw new Error(
      "Set the 'test_password' env var (-e test_password=...) to the same value passed to setup.ts, " +
        'which must be run against this server first to provision the test user pool.',
    );
  }
  // Signs in once per VU (not once per iteration - see testUsers.ts for why every VU sticking to one
  // pool identity for the whole run, rather than logging in repeatedly, matters here).
  if (!authToken) {
    authToken = login(config.url, currentTestUserName(config.pool_size), config.test_password);
  }

  getProfile(config.url, authToken);
}
