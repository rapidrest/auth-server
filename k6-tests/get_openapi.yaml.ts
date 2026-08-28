///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
///////////////////////////////////////////////////////////////////////////////
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 200,
  duration: '60s',
};

export const config = {
  url: __ENV.url || 'http://localhost:3000/api',
};

export default function () {
  const res = http.get(config.url + '/openapi/yaml');
  check(res, { 'status is 200': (res) => res.status === 200 });
}
