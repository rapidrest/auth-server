///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
/**
 * `rateLimit` (see `@rapidrest/service-core`'s `RateLimiter`) rejects more than 5 sign-in attempts for the
 * same identifier within a 5-minute window by default - a single shared identity (e.g. the default admin
 * account) can't be used as the sign-in target for more than a handful of VUs before every later login in
 * the same run gets rejected, not because anything is broken but because the rate limiter is doing exactly
 * what it's supposed to. Scripts that need many concurrent authenticated sessions instead spread their
 * logins across a pool of accounts `setup.ts` provisions ahead of time, one pool member per VU (via k6's
 * `__VU` global) - enough distinct identities that no single one sees more than a couple of login attempts
 * in a run. Endpoints that genuinely require the trusted `admin` role (there's only ever one such account)
 * take a different approach instead: see the `setup()`/`admin_*.ts` pattern, which logs in exactly once
 * per `k6 run` regardless of VU count, no matter how many VUs subsequently reuse that one token.
 */

/** The name of the `index`-th account `setup.ts` provisions - shared so load scripts can compute the same
 * name independently without setup.ts having to publish the list anywhere. */
export function testUserName(index: number): string {
  return `k6-test-user-${index}`;
}

/** Deterministically picks one of `poolSize` provisioned test users for the current VU - every VU sticks
 * to the same identity for the life of the run (matches the "log in once per VU, reuse the token/cookies
 * after that" pattern every script here already uses), and `poolSize` distinct identities spread that
 * initial login load thinly enough to stay well under the per-identifier rate limit. `declare const __VU`
 * is a k6 script-scoped global (the 1-indexed current VU number) - not a Node/browser global, so it's
 * declared here rather than imported. */
declare const __VU: number;

export function currentTestUserName(poolSize: number): string {
  return testUserName((__VU - 1) % poolSize);
}
