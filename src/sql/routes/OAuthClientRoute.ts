////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
// SPDX-License-Identifier: MPL-2.0
////////////////////////////////////////////////////////////////////////////////
import { BaseOAuthClientRouteSQL } from "@rapidrest/auth/sql";
import { RouteDecorators } from "@rapidrest/service-core";
const { ApiRoute } = RouteDecorators;

// Unlike the other OAuth routes in this tree, `Client` CRUD is not a spec-mandated bare endpoint —
// it's an ordinary admin/owner-managed REST resource, only ever consumed by this app's own admin
// console. Mounted under `/api` (like every other CRUD resource) rather than bare `/oauth/clients` so
// it goes through `apiFetch()`, which is what gives it `@RequiresElevation`'s transparent
// elevation-retry handling for free — a bare `/oauth/clients` route would need its own fetch wrapper
// to get that back.
@ApiRoute("/oauth/clients")
export class OAuthClientRoute extends BaseOAuthClientRouteSQL {}
