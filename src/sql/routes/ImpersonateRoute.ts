////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseImpersonationRouteSQL } from "@rapidrest/auth/sql";
const { ApiRoute } = RouteDecorators;

/**
 * Grouped under `/admin` alongside `AdminRoute`'s own `/admin/release-notes` — every route here requires
 * the `admin` trusted role. `BaseImpersonationRoute`'s own method decorators already declare the
 * `/impersonate` and `/impersonate/stop` sub-paths, so the resulting endpoints are `POST /admin/impersonate`
 * and `GET /admin/impersonate/stop`.
 */
@ApiRoute("/admin")
export class ImpersonateRoute extends BaseImpersonationRouteSQL {}
