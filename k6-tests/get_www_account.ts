import http from 'k6/http';
import { check } from 'k6';
import { login } from './login.ts';
import { currentTestUserName } from './testUsers.ts';

export const options = {
  vus: 200,
  duration: '60s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000',
  api_url: __ENV.api_url || 'http://localhost:3000/api',
  test_password: __ENV.test_password || '',
  pool_size: Number(__ENV.pool_size || 100),
};

let signedIn = false;

export default function () {
  if (!config.test_password) {
    throw new Error(
      "Set the 'test_password' env var (-e test_password=...) to the same value passed to setup.ts, " +
        'which must be run against this server first to provision the test user pool.',
    );
  }

  // Sign in once per VU - k6's per-VU cookie jar carries the `jwt` cookie this sets onto the plain GET
  // below automatically, so the page actually renders its authenticated (not signed-out) SSR content.
  // IMPORTANT: this only actually happens against an HTTPS target. The `jwt` cookie is `Secure` by
  // default (see refresh_token.ts's doc comment for the full explanation) - k6's cookie jar correctly
  // won't carry it onto a plain `http://` request, so against a plain-HTTP target this still gets a 200
  // (the page's signed-out shell), just not the authenticated content it's meant to exercise.
  if (!signedIn) {
    login(config.api_url, currentTestUserName(config.pool_size), config.test_password);
    signedIn = true;
  }

  const res = http.get(config.url + '/account');
  check(res, { 'status is 200': (res) => res.status === 200 });
}
