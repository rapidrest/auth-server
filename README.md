# RapidREST: Authentication Server

[![CI](https://github.com/rapidrest/auth-server/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/rapidrest/auth-server/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/rapidrest/auth-server/badge.svg?branch=main)](https://coveralls.io/github/rapidrest/auth-server?branch=main)
[![npm version](https://img.shields.io/npm/v/@rapidrest/auth-server)](https://www.npmjs.com/package/@rapidrest/auth-server)

A reference implementation of a RapidREST authorization server built on [@rapidrest/auth](https://github.com/rapidrest/auth), [@rapidrest/service-core](https://github.com/rapidrest/service-core) and [@rapidrest/react](https://github.com/rapidrest/react), providing a complete, deployable authentication/account-management service plus a React front end and admin console.

### Authentication

* Sign-in and self-service registration flows
* Multi-factor authentication (MFA) — TOTP, one-time passwords (OTP), FIDO2/WebAuthn hardware keys, passkeys and recovery codes
* Sign-in with Apple, Facebook, Google and Microsoft via OAuth 2.0/OpenID Connect
* Step-up account elevation (`@RequiresElevation`) requiring re-verification before sensitive actions
* Secure, `HttpOnly` cookie-based session issuance

### OAuth 2.0 / OpenID Connect Authorization Server

* Authorization code and refresh token grants, plus token introspection and revocation endpoints
* OIDC discovery, JWKS and UserInfo endpoints
* Hosted consent/authorize screen for third-party clients
* Admin-managed client registration — confidential and public clients, with secret regeneration/reveal

### Account Management

* Account registration and profile pages, including multiple aliases (e.g. email, phone, third-party OAuth ID)
* Change-password and secret (TOTP/Passkey/FIDO2) enrollment flows
* Self-service account deletion

### Admin Console

* A dedicated admin dashboard app for managing user accounts — search/filter, create, view/edit detail (roles, scopes, verification, MFA), and delete
* OAuth client management — create, view/edit, rotate secrets, and delete
* Site branding customization — logo, site title, custom header/footer HTML and stylesheet
* Admin impersonation of user accounts, with a persistent banner while impersonating
* Default account provisioning on startup via a configurable background job

### Data & Deployment

* MongoDB and SQL (via TypeORM) backends
* Docker and Docker Compose support (including dedicated Mongo/SQL/debug compose files)
* Helm chart for Kubernetes support
* Prometheus metrics, OpenAPI 3 spec generation
* k6 load test suites

## Getting Started

To get started using this service first clone the source. It is highly recommended that you fork the project first.

```bash
git clone github/auth-server
```

## Deployment

| Docker Image |                       |
| ------------ | :-------------------: |
| Registry     | ghcr.io |
| Repository   | /rapidrest/auth-server |
| Tag          | 1.0.0-beta.2 |

This project provides scripts for running in Docker or Kubernetes. For Docker, you will find *docker-compose* scripts
in the project source. For Kubernetes, a *helm* chart is available both in the project source and via GitHub Container
Registry (ghcr.io).

### Docker Compose

To run this project on docker you must use the included *docker-compose* scripts in the project source. Open up a new
shell to the cloned folder and build the Docker image using `docker-compose`.

```bash
docker-compose build
```

You can now run the server with the following command.

```bash
docker-compose up
```

### Kubernetes

A complete Helm chart is included for convenience to deploy and run on a Kubernetes cluster. Deployment to Kubernetes
is easy using either the published helm chart in GitHub or install from the helm chart locally.

#### From GHCR

```bash
helm install --create-namespace --namespace auth-server auth-server oci://ghcr.io/rapidrest/charts/auth-server --version 1.0.0-beta.2
```

#### From Local

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm dep up ./helm
helm install --create-namespace --namespace auth-server auth-server ./helm
```

#### Single Node Cluster

If you would like to run the project in a single-node Kubernetes cluster (k3s), the `k3s_install.sh` script is a
great way to get started. This script will automatically set up everything needed to run *auth-server* in a Kubernetes
environment, including ingress with TLS support. Simply run the script from any linux compatible machine.

```bash
./scripts/k3s_install.sh
```

### Secrets and OpenBao

With `global.openbao.enabled` this deployment keeps its JWT, cookie and session secrets in
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
hold `auth_secret`, `cookie_secret` and `session__secret` under `global.openbao.kvMount` at `global.openbao.secretsPath`
(`<release>/secrets` by default), with `global.openbao.auth.tokenSecret` naming a Secret whose `token` may read them.
Left off (the chart's default), the secrets stay in Kubernetes Secrets as before.

## Debugging

[Visual Studio Code](https://code.visualstudio.com/) is the recommended IDE to develop with. The project includes workspace and launch configuration files out of the box.

To debug while running via Docker Compose select the `Docker: Attach Debugger` configuration and hit the `F5` key. If you want to run the server directly and debug choose the `Launch Server` configuration.