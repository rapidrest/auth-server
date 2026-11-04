# RapidREST: Authentication Server

[![CI](https://github.com/rapidrest/auth-server/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/rapidrest/auth-server/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/rapidrest/auth-server/badge.svg?branch=main)](https://coveralls.io/github/rapidrest/auth-server?branch=main)

A reference implementation of a RapidREST authorization server built on [@rapidrest/auth](https://github.com/rapidrest/auth), [@rapidrest/service-core](https://github.com/rapidrest/service-core) and [@rapidrest/react](https://github.com/rapidrest/react), providing a complete, deployable authentication/account-management service plus a React front end and admin console.

### Authentication

* Sign-in and self-service registration flows
* Multi-factor authentication (MFA) — TOTP, one-time passwords (OTP) by e-mail, SMS or WhatsApp, FIDO2/WebAuthn hardware keys, passkeys and recovery codes
* Sign-in with Apple, Facebook, Google and Microsoft via OAuth 2.0/OpenID Connect — a provider's button only appears on the sign-in page once its `auth.<provider>.clientID` is set to your real value
* Step-up account elevation (`@RequiresElevation`) requiring re-verification before sensitive actions — a downstream app can send a signed-in user to `/auth/elevate?return_to=<url>` to elevate and come straight back
* Secure, `HttpOnly` cookie-based session issuance
* CSRF (double-submit cookie) protection on every cookie-authenticated, state-changing request — on by default (`csrf`/`auth:csrf` config)

### OAuth 2.0 / OpenID Connect Authorization Server

* Authorization code and refresh token grants, plus token introspection and revocation endpoints
* OIDC discovery, JWKS and UserInfo endpoints
* Hosted consent/authorize screen for third-party clients
* Admin-managed client registration — confidential and public clients, with secret regeneration/reveal
* `POST /oauth/session-token` — lets a native app that already holds an OAuth access token (from this server's own `/oauth/authorize` + `/oauth/token`, e.g. a `PUBLIC` client with no secret) trade it for an ordinary session JWT, so it can also call this app's own session-authenticated `/api/...` routes without those routes needing to understand OAuth bearer tokens

### Account Management

* Account registration and profile pages, including multiple aliases (e.g. email, phone, third-party OAuth ID)
* Change-password (in place, from the Sign-in methods card) and secret (TOTP/Passkey/FIDO2) enrollment flows
* App passwords — separate, server-generated passwords a user creates for an app/client that can't complete a two-factor prompt (e.g. an older e-mail client speaking HTTP Basic Auth), each independently revocable and shown once at creation
* A "Return to App" button on `/account` that sends the user back to the downstream app named by `app_url`
* Self-service account deletion

### Admin Console

* A user menu with a dark/light theme toggle and, inside the admin console, an "Exit Admin Console" shortcut back to `/`
* A dedicated admin dashboard app for managing user accounts — search/filter, create, view/edit detail (roles, scopes, verification, MFA), and delete
* OAuth client management — create, view/edit, rotate secrets, and delete
* Site branding customization — logo, site title, custom header/footer HTML and stylesheet — which a deployment can pre-set from config (`site_settings`) and an admin can change afterwards
* E-mail, SMS and WhatsApp message templates — edit the wording of every one-time-code message with a live preview, stored in the database (no redeploy) and branded from the site branding by default — plus the SMTP server, the SMS provider (Twilio or Telnyx, one at a time), the WhatsApp credentials and the sender addresses they're sent with, seeded from config on first start and editable from then on
* Admin impersonation of user accounts, with a persistent banner while impersonating
* A durable, filterable **Audit Log** of security-relevant account activity — sign-ins (by method), registration, elevation, impersonation, account deletion, "log out everywhere", MFA changes, and app-password lifecycle — plus a **Recent activity** section on each account's own detail page; see [Audit logging](#audit-logging)
* A **Diagnostics** page for troubleshooting a deployment — versions of the server, its packages, its datastore containers and the Kubernetes cluster, the server's environment variables and configuration (secrets withheld), live CPU / memory / disk and volume-claim usage, a live, downloadable tail of the service log, and a downloadable report; see [Diagnostics](#diagnostics)
* Default account provisioning on startup via a configurable background job

### Data & Deployment

* MongoDB and SQL (via TypeORM) backends
* Docker and Docker Compose support (including dedicated Mongo/SQL/debug compose files)
* Helm chart for Kubernetes, served through a Gateway API Gateway (Envoy Gateway by default) with HTTP→HTTPS redirect, HSTS and baseline security headers
* Secrets generated once and kept across upgrades, either in Kubernetes Secrets or in OpenBao via External Secrets
* Prometheus metrics, OpenAPI 3 spec generation
* k6 load test suites

## Getting Started

To get started using this service first clone the source. It is highly recommended that you fork the project first.

```bash
git clone https://github.com/rapidrest/auth-server.git
cd auth-server
```

You need Node.js 24 or newer and Yarn 4, which [Corepack](https://github.com/nodejs/corepack) provides at the version
pinned in `package.json`. Recent Node.js releases no longer ship Corepack, so install it first:

```bash
npm install -g corepack
corepack enable
yarn install
```

| Command | What it does |
| --- | --- |
| `yarn dev` | Starts in-memory databases, then runs the server from `src/` with live reload and rebuilds the React apps on change (`yarn debug` adds the Node inspector on port 9229). |
| `yarn build` | Builds the server and the React apps into `dist/`. |
| `yarn start` | Runs the built server. |
| `yarn test` | Runs the test suite with coverage. The Helm chart tests need `helm` on the `PATH` and are skipped without it. |
| `yarn lint` | Lints `apps/`, `src/` and `test/`. |

`yarn dev` reads the datastores in `src/config.ts` and starts an in-memory MongoDB, Redis and/or PostgreSQL to match,
so nothing has to be installed. To use your own databases instead, run `yarn dev -d` and point
`datastores__<name>__url` at them. To develop against PostgreSQL, switch the export in `src/config.ts` to
`config.sql.js`. The Docker image starts `dist/src/server.mongo.js`, and `docker-compose.sql.yml` overrides that
with `dist/src/server.sql.js`.

## Configuration

Settings are read from `src/config.*.ts` and can be overridden from the environment. Environment variables keep their
case and use `__` for nesting, so write them the way the key is written below (`smtp_config__host`, not
`SMTP_CONFIG__HOST`). Several of these only *seed* a value the first time the server starts; after that the admin
console owns it (see each row).

| Key | What it does |
| --- | --- |
| `app_url` | The downstream application `/account`'s **Return to App** button sends the user back to. An absolute `http(s)` URL; unset (or anything else) hides the button. |
| `site_settings` | Pre-sets the site branding — `siteTitle`, `companyName`, `headerHtml`, `footerHtml`, `logoUrl`, `iconUrl`, `stylesheetUrl` — so a downstream app can deploy with its own brand. **Seeds once**: the first time the branding is read, only the fields still empty are filled from here; from then on the admin console's Site Settings page is the source of truth, so an admin's change (or clearing a field) is never overwritten. `logoUrl`/`iconUrl`/`stylesheetUrl` must be `http(s)` URLs or root-relative paths; an invalid value is logged and skipped. Uploaded images/CSS can't come from config. |
| — | The Site Settings page's **Reset branding** button puts every branding field (and any directly uploaded logo/icon/stylesheet) back to what `site_settings` says right now, for a config change made after the row was already seeded. |
| `sms_config` | How texts are sent: `provider` is `twilio` **or** `telnyx` (one at a time) and `config` holds that provider's settings — `{ accountSid, token }` for Twilio, `{ apiKey, messagingProfileId }` for Telnyx. The sender is `templates.from.sms`. Seeds once; edit it afterwards on the admin Messages page. |
| `whatsapp` | WhatsApp Business Cloud API credentials: `{ accessToken, phoneNumberId, apiVersion }` (`phoneNumberId` is Meta's ID for your number, not the number). Seeds once; edit it on the Messages page. |
| `smtp_config` | The SMTP server for e-mail, as before. Seeds once. |
| `auth:app_password:enabled` | Set to `false` to turn off app passwords deployment-wide: creating new ones is refused and existing ones stop authenticating (not deleted — re-enabling restores them). Defaults to `true`. |
| `audit_log:retention_days` | How long an audit log entry is kept before the daily retention job purges it. Unset/`null` (the default) means **never purge** — an audit trail losing data unexpectedly would be a real regression, so there's no other way to enable purging. |
| `auth:oauth_server:keys:encryption_key` | AES-256 key (64 hex characters) that encrypts the OAuth server's signing keys and the stored messaging credentials at rest. The checked-in default is public, so set your own. The Helm chart generates one and keeps it. |
| `auth:totp:encryption_key` | AES-256 key (64 hex characters) that encrypts every user's TOTP/MFA shared secret at rest. Unset, TOTP secrets are stored in plaintext. The Helm chart generates one and keeps it. |

#### Secrets in production

`cookie_secret`, `auth:secret`, `session:secret` and `auth:oauth_server:keys:encryption_key` ship with development
defaults that anyone reading this repository knows. **In production the server refuses to start while any of them
still holds its default**, and it names the ones to set. Production means `environment` or `NODE_ENV` is
`production`; the Helm chart sets both. The server also starts with a warning if a sign-in provider still has the
placeholder credentials shipped in config.

Once data has been encrypted, the two encryption keys can't change casually: anything encrypted with the old key
becomes unreadable. Keep them stable across deployments, as the Helm chart does.

> **Passkeys/FIDO2 on a real deployment:** the Helm chart now defaults `auth:passkey`/`auth:fido2`'s `rpID`/
> `origin` to the server's own host (`service-config.yaml`), since `@rapidrest/auth`'s built-in default (rpID
> `rapidrest`) never matches a real domain and made every passkey/security-key registration fail instantly. Not
> using the Helm chart? Set `auth__passkey__rpID`/`auth__passkey__origin` and `auth__fido2__rpID`/
> `auth__fido2__origin` (a bare domain, and a full `https://` origin) yourself.

> **Breaking (@rapidrest/core 6):** the top-level `twilio` config key is gone — move it to
> `sms_config: { provider: twilio, config: { accountSid, token } }` (env: `sms_config__provider`,
> `sms_config__config__accountSid`, `sms_config__config__token`). A deployment that already started keeps working
> without any change, since its Twilio credentials were copied into the database on first start. The admin API moved
> from `/api/settings/twilio` to `/api/settings/sms` (and `/api/settings/whatsapp` is new).

### App passwords

From the account page's **App passwords** card, a user can create a separate, server-generated password for one
app or device that can't respond to a two-factor prompt — an older e-mail client speaking HTTP Basic Auth to a
downstream service (e.g. a mail server) that validates its credentials against this server's `/auth/basic`, for
example. Unlike the account's real password, an app password is allowed to authenticate over `/auth/basic` even
when the account has `requireMFA` set — that bypass is the entire point: a legacy client that can't complete an
MFA challenge gets its own high-entropy, individually revocable credential instead of the account's MFA being
disabled to accommodate it. A real password is never exempt from `requireMFA` there. The plaintext is shown
exactly once, at creation; only its hash is ever stored, and there's no way to rotate one in place — remove it
and create a new one. See `auth:app_password:enabled` above to turn the feature off.

Every secret — this one included — also tracks when it was last used to sign in, shown on the account
page (and to an admin viewing an account's Sign-in methods) as "Never used" until then; an admin can now
also see and revoke a user's app passwords and recovery codes from that same card, which previously left
both out.

### Audit logging

Every security-relevant account action — a sign-in (labeled by method: password, app password, MFA, passkey,
security key, TOTP, OTP, an OAuth/OIDC provider), self-registration, elevation, admin impersonation, account
deletion, "log out everywhere", a second factor enrolled or removed, a password changed, or an app password
created/removed/used — is written to a durable, admin-queryable audit log. An admin's **Audit Log** page lists
and filters every account's entries; each account's own detail page also shows its own **Recent activity**.
This is deliberately a separate mechanism from `@rapidrest/core`'s `EventUtils`: that one is lossy, best-effort
telemetry (with no `telemetry_services:url` configured — this app's default — it silently discards every event
end to end, and nothing here registers a listener either) and was never meant to be relied on for a real audit
trail. Writing an entry never blocks the action that triggered it — a failure is logged loudly instead of
silently dropped — and nothing is ever purged unless `audit_log:retention_days` is explicitly set (see the
config table above).

### Diagnostics

The admin console's **Diagnostics** page (`/admin/diagnostics`, backed by `/api/admin/diagnostics/*`) has four tabs, and
the same page and engine as the RapidMX server's:

* **Information** — the deployed package, Node.js and V8, the host and how long the server has been up; the other
  containers of the deployment (MongoDB, PostgreSQL, Redis) with their status, image tag, digest, restarts and node,
  expandable to their pods; every installed package, filterable, with the direct dependencies marked; and the
  server's environment variables and configuration (`/api/admin/diagnostics/information`). Settings named in
  `src/diagnostics/hiddenSettings.ts` (the signing secrets, encryption keys, provider and messaging credentials,
  datastore passwords) show their name only. Every other value is shown, with credentials scrubbed out of it: a URL's
  `user:password@`, private keys, JWTs, `Bearer` tokens and `password=` pairs. A new secret setting has to be added to
  that list.
* **Runtime** — the Kubernetes version and distribution (k3s, RKE2, EKS, GKE, AKS), the namespace, and the nodes the
  deployment's pods run on.
* **System** — live, every 5 seconds while the tab is open (pausable), with the last five minutes as sparklines: the
  node the server runs on (CPU, memory, load, disks), this server process, the namespace's pods (CPU and memory from
  `metrics-server`) and its persistent volumes, with usage for the volumes this pod has mounted.
* **Logs** — a live tail of `/api/admin/logs` from every replica, filterable by level and text, with captures
  downloadable as text (`.log`) or JSON Lines (`.ndjson`).

**Download diagnostics report** saves the versions, the environment and configuration (hidden and scrubbed as above),
the runtime and the latest usage sample as one JSON file (no logs).
The page needs the `admin` role and a fresh elevation, like the rest of the console.

The Kubernetes parts use the pod's own ServiceAccount to read the API, read-only and only inside its own
namespace: the Helm chart adds a `Role` and `RoleBinding` for it (`global.diagnostics.rbac.create`, on by
default). Nodes and the kubelet's disk statistics are cluster-scoped, so the node figures are the ones the server's
own container sees, and only the volumes this pod mounts have usage figures; the others show their size. Live pod CPU
and memory come from `metrics-server` (installed with k3s); without it the page says so. Outside Kubernetes those
parts simply report that they aren't available. `diagnostics:namespace` (the namespace to inspect; empty is the pod's
own) and `diagnostics:timeout_ms` (how long one Kubernetes API request may take, 5000 by default) are in
`config.mongo.ts` and `config.sql.ts`. The live log needs the `logs` datastore (Redis) that `/api/admin/logs` itself
needs, which the compose files and the chart both configure.

### WhatsApp one-time codes

With WhatsApp configured, a verified phone number can receive its sign-in, second-factor and elevation code over
WhatsApp as well as SMS: it shows up as an extra "WhatsApp" choice beside the SMS one. (Verifying a contact and
registering still use e-mail/SMS.)

WhatsApp only delivers free-form text to someone who has messaged you in the last 24 hours, and a one-time code is
almost never that, so for real users approve a message template in Meta's WhatsApp Manager and name it on the
template's page in the admin console (or under `templates.<name>.whatsapp_template` in config: `name`, `language`
and `parameters`, e.g. `["{{totp}}"]`). Until you do, the free-form text is sent, which is fine for testing.

## Deployment

| Docker Image |                       |
| ------------ | :-------------------: |
| Registry     | ghcr.io |
| Repository   | /rapidrest/auth-server |
| Tag          | 1.0.0         |

This project provides scripts for running in Docker or Kubernetes. For Docker, you will find *docker-compose* scripts
in the project source. For Kubernetes, a *helm* chart is available both in the project source and via GitHub Container
Registry (ghcr.io).

### Docker Compose

There is no default `docker-compose.yml`: pick the file for the datastore you want and pass it with `-f`, before
the subcommand.

| File | Runs |
| --- | --- |
| `docker-compose.mongo.yml` | The server with MongoDB and Redis. |
| `docker-compose.sql.yml` | The server with PostgreSQL and Redis. |
| `docker-compose.debug.yml` | Layered on top of either: runs `yarn debug` with `apps/` and `src/` mounted, for live reload and the debugger. |

```bash
docker compose -f docker-compose.mongo.yml up --build
```

The server listens on port 3000 (the Node inspector on 9229) and starts only once Redis and the database report
healthy. To debug, add the debug file:

```bash
docker compose -f docker-compose.mongo.yml -f docker-compose.debug.yml up --build
```

### Kubernetes

A complete Helm chart is included for convenience to deploy and run on a Kubernetes cluster. Deployment to Kubernetes
is easy using either the published helm chart in GitHub or install from the helm chart locally.

#### From GHCR

```bash
helm install --create-namespace --namespace auth-server auth-server oci://ghcr.io/rapidrest/charts/auth-server --version 1.0.0
```

#### From Local

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dep up ./helm
helm install --create-namespace --namespace auth-server auth-server ./helm
```

#### Gateway and TLS

The chart exposes the server through a [Gateway API](https://gateway-api.sigs.k8s.io) Gateway that it creates itself
(`global.gateway`, class `envoy` by default), at `host` (`auth.<global.domain>` by default). With `global.gateway.tls`
on and a public host (not `localhost`, `*.localhost` or `*.local`), cert-manager issues its certificate, and:

* plain HTTP is redirected (301) to HTTPS. Set `global.gateway.httpRedirect: false` when something in front of the
  Gateway already ends TLS and forwards plain HTTP to it (Cloudflare "flexible" SSL, a load balancer's TLS listener),
  or every request redirects to itself in a loop;
* every response carries `Strict-Transport-Security` (turn it off with `global.gateway.hsts: false`), a baseline
  `Content-Security-Policy`, `X-Content-Type-Options` and `Referrer-Policy`.

#### Generated secrets

Any of the cookie, session and JWT secrets and the two [encryption keys](#secrets-in-production) left empty is
generated on install and kept in the release's Secrets, so upgrades read it back instead of logging everyone out or
making encrypted data unreadable. Set them explicitly with `global.secrets.cookies`, `global.secrets.sessions`,
`global.jwt.secret`, and `service.config.auth__oauth_server__keys__encryption_key` /
`service.config.auth__totp__encryption_key`. Alternatively, point `global.secrets.existingSecret` at a Secret you
manage.

Keeping a generated secret depends on reading the existing one back from the cluster. **When the chart is rendered
without cluster access** (`helm template`, a GitOps controller such as Argo CD, `--dry-run`), it can't do that, so
the render fails and names the values to set. Set them, or use `existingSecret` or [OpenBao](#secrets-and-openbao).

#### Single Node Cluster

If you would like to run the project in a single-node Kubernetes cluster (k3s), the `k3s_install.sh` script is a
great way to get started. It installs k3s, Envoy Gateway, cert-manager (for TLS), External Secrets and OpenBao, then
the chart. Run it from any Linux machine:

```bash
./scripts/k3s_install.sh --domain example.com
```

Its options include `--domain`, `--auth-host`, `--version` (the chart version), `--tls`, `--email` (for the ACME
account), `--openbao true|false`, `--skip-k3s` (use the cluster already there) and `--uninstall`; `--help` lists
them all.

### Secrets and OpenBao

With `global.openbao.enabled` this deployment keeps its JWT, cookie and session secrets and its two encryption keys in
[OpenBao](https://openbao.org), and [External Secrets](https://external-secrets.io) copies them into the Kubernetes
Secrets the pod loads. Each value is written once and never rewritten, so an upgrade no longer invalidates issued tokens,
cookies or sessions.

**OpenBao is a prerequisite, like cert-manager - the chart doesn't install it**, which is why the value is off by
default: a plain `helm install` shouldn't assume a vault is there. `scripts/k3s_install.sh` installs one and turns it on
(`--openbao true`, on by default there): it installs the vault, initialises it, keeps the unseal key in a Kubernetes Secret
with an unsealer Deployment that re-unseals it after any restart, writes this deployment's secrets, and creates the token
External Secrets reads them with. External Secrets has to be there too; its CRDs are cluster-wide, so the chart can't
bring them, and the render fails with the exact command when it's missing.

Installed as a subchart of the [RapidMX server](https://github.com/rapidmx/server), the vault's coordinates come from
that release (`global.openbao`), so both ends read the same JWT secret and neither is passed a value.

Point `global.openbao.address` at an OpenBao you already run to use that one instead
(`global.openbao.auth.method: kubernetes` authenticates with the pod's ServiceAccount and stores no token). It has to
hold `auth_secret`, `cookie_secret`, `session__secret`, `oauth_server_encryption_key` and `totp_encryption_key` (the
last two as 64-hex strings) under `global.openbao.kvMount` at `global.openbao.secretsPath` (`<release>/secrets` by
default), with `global.openbao.auth.tokenSecret` naming a Secret whose `token` may read them. If the vault's listener
certificate is signed by a private CA, set `global.openbao.caConfigMap` to a ConfigMap in the release namespace that
holds it under `ca.crt`. The RapidMX server chart creates `<fullname>-openbao-ca` for this.
Left off (the chart's default), the secrets stay in Kubernetes Secrets as before.

## Debugging

[Visual Studio Code](https://code.visualstudio.com/) is the recommended IDE to develop with. The project includes workspace and launch configuration files out of the box.

To debug while running via Docker Compose (with `docker-compose.debug.yml`, see [Docker Compose](#docker-compose)),
select the `Docker: Attach to Node` configuration and hit the `F5` key. To debug the server directly, choose
`Launch Server`, which runs `yarn dev` under the debugger, or start `yarn debug` yourself and choose
`Attach to yarn debug`. `Debug Current Test File` runs the test file open in the editor under the debugger.