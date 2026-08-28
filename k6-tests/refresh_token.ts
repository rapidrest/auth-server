///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import http from 'k6/http';
import { check } from 'k6';
import { login } from './login.ts';
import { currentTestUserName } from './testUsers.ts';

// `per-vu-iterations`/`iterations: 1`, not a continuous `vus`+`duration` loop: a real client only calls
// this once per access-token lifetime (`useSessionRefresh.ts` refreshes every 55 minutes - see
// `apps/shared/lib/useSessionRefresh.ts`), so this models many sessions' refreshes landing in a burst
// (e.g. many tabs opened around the same time) rather than one session refreshing continuously.
//
// IMPORTANT: run this against an HTTPS target for a meaningful result. `auth:cookie` marks the `jwt` and
// `refresh` cookies `Secure` by default (see the comment above `cookie:` in config.mongo.ts/config.sql.ts)
// - correct, since a real deployment is served over HTTPS - but it means `POST /auth/refresh` needs the
// `jwt` cookie login set, and k6's cookie jar (correctly, per RFC 6265, unlike curl's own jar which does
// send Secure cookies over plain HTTP regardless - confirmed while writing this script) will not carry a
// Secure cookie onto a plain `http://` request. Every request in this script still succeeds against a
// plain-HTTP target, but the refresh call itself will 401 there for this reason - not a server bug.
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

export function refresh(url: string) {
  // No body/Authorization header - `POST /auth/refresh` reads the HttpOnly `refresh` cookie the login
  // call set, which k6's per-VU cookie jar carries onto this request automatically.
  const res = http.post(url + '/auth/refresh', null);
  check(res, { 'status is 2XX': (res) => res.status >= 200 && res.status < 300 });
  return res.body;
}

export default function () {
  if (!config.test_password) {
    throw new Error(
      "Set the 'test_password' env var (-e test_password=...) to the same value passed to setup.ts, " +
        'which must be run against this server first to provision the test user pool.',
    );
  }
  // Each VU signs in as its own distinct pool identity, not a shared one (see testUsers.ts for why: the
  // per-identifier rate limit every other script here also has to avoid).
  login(config.url, currentTestUserName(config.pool_size), config.test_password);
  refresh(config.url);
}
