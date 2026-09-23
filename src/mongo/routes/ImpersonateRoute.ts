////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { RouteDecorators } from "@rapidrest/service-core";
import { BaseImpersonationRouteMongo } from "@rapidrest/auth/mongo";
const { ApiRoute } = RouteDecorators;

/**
 * Grouped under `/admin` alongside `AdminRoute`'s own `/admin/release-notes` — every route here requires
 * the `admin` trusted role. `BaseImpersonationRoute`'s own method decorators already declare the
 * `/impersonate` and `/impersonate/stop` sub-paths, so the resulting endpoints are `POST /admin/impersonate`
 * and `POST /admin/impersonate/stop` (a state-changing `GET` would be exploitable via a bare navigation,
 * bypassing CSRF defenses entirely — see `BaseImpersonationRoute`).
 */
@ApiRoute("/admin")
export class ImpersonateRoute extends BaseImpersonationRouteMongo {}
