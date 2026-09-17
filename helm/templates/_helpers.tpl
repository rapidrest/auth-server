{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "rrst.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "rrst.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "rrst.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "rrst.labels" -}}
app.kubernetes.io/name: {{ include "rrst.name" . }}
helm.sh/chart: {{ include "rrst.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Renders a value that contains template.
Usage:
{{ include "rrst.render" ( dict "value" .Values.path.to.the.Value "context" $) }}
*/}}
{{- define "rrst.render" -}}
    {{- if typeIs "string" .value }}
        {{- tpl .value .context }}
    {{- else }}
        {{- tpl (.value | toYaml) .context }}
    {{- end }}
{{- end -}}

{{/*
Generate certificates for nginx
*/}}
{{- define "rrst.gen-nginx-certs" -}}
{{- $ca := genCA "xbe-ca" 365 -}}
{{- $cert := genSignedCert . nil nil 365 $ca -}}
tls.crt: {{ $cert.Cert | b64enc }}
tls.key: {{ $cert.Key | b64enc }}
{{- end -}}

{{/*
Generate list of domains with subdomain and/or path
*/}}
{{- define "rrst.domains" -}}
{{- $Values := .Values }}
{{- $SubDomain := "" }}
{{- if and .system (hasKey .system "host_subdomain") }}
    {{- $SubDomain = .system.host_subdomain }}
{{- end -}}
{{- $Path := "" }}
{{- if .path }}
    {{- $Path = .path }}
{{- end -}}
{{- $Protocol := "" }}
{{- if .protocol }}
    {{- $Protocol = .protocol }}
{{- end -}}
{{- $NewDomains := list  }}
{{- $CurrentDomains := list $Values.domain }}
{{- if and (hasKey $Values "alias_domains") (kindIs "slice" $Values.alias_domains)}}
{{- $CurrentDomains = concat $CurrentDomains $Values.alias_domains -}}
{{- end -}}
{{- range $domain := $CurrentDomains -}}
    {{- if $SubDomain }}
    {{- $domain = printf "%s.%s" $SubDomain (tpl $domain $Values) -}}
    {{- else}}
    {{- $domain = printf "%s" (tpl $domain $Values) -}}
    {{- end}}
    {{- if $Protocol }}
    {{- $domain = printf "%s://%s" $Protocol $domain -}}
    {{- end}}
    {{- if $Path }}
    {{- $domain = printf "%s%s" $domain $Path -}}
    {{- end}}
    {{- $NewDomains = append $NewDomains $domain -}}
{{- end -}}
{{ $NewDomains | toJson }}
{{- end -}}
{{/*
Generate list of domains with subdomain and/or path
*/}}

{{- define "rrst.domains.ingress" -}}
{{- $Values := .Values }}
{{- $System := .Values.ingress }}
{{- include "rrst.domains" (dict "Values" $.Values "system" $System) }}
{{- end -}}

{{/*
Fails the render (with `required`, so `helm lint` still passes) when generated secrets can't be kept stable: without
cluster access (`helm template`, a GitOps controller rendering the chart, `--dry-run`) `lookup` returns nothing, so every
render would generate new JWT/cookie/session secrets - logging everyone out on each sync. Detected by looking up the
release namespace's "kube-root-ca.crt" ConfigMap (published into every namespace), which a namespace-scoped install can
read; only when that finds nothing (e.g. `--create-namespace`, which renders before the namespace exists) is the
cluster-scoped "default" Namespace tried. lookup fails the render on Forbidden, so the cluster-scoped probe must not come
first.
Usage: include "auth-server.assertStableSecrets" (dict "missing" (list "cookies.secret" ...) "context" $)
*/}}
{{- define "auth-server.assertStableSecrets" -}}
{{- if and .missing (not .context.Values.secrets.existingSecret) -}}
{{- $clusterAccess := lookup "v1" "ConfigMap" .context.Release.Namespace "kube-root-ca.crt" -}}
{{- if not $clusterAccess -}}
{{- $clusterAccess = lookup "v1" "Namespace" "" "default" -}}
{{- end -}}
{{- if not $clusterAccess -}}
{{- required (printf "Rendering without cluster access (helm template, GitOps, --dry-run), so generated secrets would change on every render. Set %s explicitly, or secrets.existingSecret to a Secret you manage." (join ", " .missing)) "" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
A base64-encoded secret that's generated once and kept: the explicit value when one is set, otherwise the value already
stored in the release's Secret (so it survives upgrades), otherwise a new random one.
Usage: include "auth-server.persistedSecret" (dict "value" .Values.cookies.secret "stored" $storedB64 "context" $)
*/}}
{{- define "auth-server.persistedSecret" -}}
{{- $explicit := tpl (.value | default "") .context -}}
{{- if $explicit -}}
{{- $explicit | b64enc -}}
{{- else if .stored -}}
{{- .stored -}}
{{- else -}}
{{- randAlphaNum 48 | b64enc -}}
{{- end -}}
{{- end -}}

{{/*
Where this deployment's secrets live: the OpenBao at global.openbao.address, which the install script sets up or you
point at your own. As a subchart of the RapidMX server those values come from that release, which is how both ends read
the same JWT secret.
*/}}
{{- define "auth-server.vaultManagedSecrets" -}}
{{- if and .Values.externalSecrets.enabled (.Values.global).openbao -}}
{{- if .Values.global.openbao.enabled -}}
true
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "auth-server.vaultAddress" -}}
{{- include "rrst.render" (dict "value" .Values.global.openbao.address "context" .) -}}
{{- end -}}

{{- define "auth-server.vaultKvMount" -}}
{{- include "rrst.render" (dict "value" .Values.global.openbao.kvMount "context" .) | default "secret" -}}
{{- end -}}

{{- define "auth-server.vaultSecretsPath" -}}
{{- include "rrst.render" (dict "value" .Values.global.openbao.secretsPath "context" .) | default (printf "%s/secrets" (include "rrst.fullname" .)) -}}
{{- end -}}

{{/* How External Secrets authenticates: a token Secret, or Kubernetes auth against a shared vault's mount. */}}
{{- define "auth-server.vaultAuth" -}}
{{- $auth := .Values.global.openbao.auth -}}
{{- if not (include "auth-server.vaultAddress" .) -}}
{{- fail "global.openbao.enabled is true but global.openbao.address is empty: point it at the OpenBao this cluster runs (e.g. http://openbao.openbao.svc:8200), which scripts/k3s_install.sh installs for you." -}}
{{- end -}}
{{- if and (eq $auth.method "kubernetes") (not (include "rrst.render" (dict "value" $auth.kubernetes.role "context" .))) -}}
{{- fail "global.openbao.auth.method is \"kubernetes\" but global.openbao.auth.kubernetes.role is empty: set the OpenBao role bound to this namespace's ServiceAccount." -}}
{{- end -}}
{{- if eq $auth.method "kubernetes" -}}
kubernetes:
  mountPath: {{ include "rrst.render" (dict "value" $auth.kubernetes.mountPath "context" .) | quote }}
  role: {{ include "rrst.render" (dict "value" $auth.kubernetes.role "context" .) | quote }}
  serviceAccountRef:
    name: {{ include "rrst.render" (dict "value" $auth.kubernetes.serviceAccount "context" .) | default "default" | quote }}
{{- else -}}
tokenSecretRef:
  name: {{ include "rrst.render" (dict "value" $auth.tokenSecret "context" .) | default (printf "%s-openbao-eso" (include "rrst.fullname" .)) | quote }}
  key: {{ $auth.tokenSecretKey | default "token" | quote }}
{{- end }}
{{- end -}}

{{/*
The External Secrets API version this cluster serves, failing with something actionable when the operator isn't
installed - its CRDs are cluster-wide, so a chart can't bring them along.
*/}}
{{- define "auth-server.externalSecretsApiVersion" -}}
{{- if .Capabilities.APIVersions.Has "external-secrets.io/v1" -}}
external-secrets.io/v1
{{- else if .Capabilities.APIVersions.Has "external-secrets.io/v1beta1" -}}
external-secrets.io/v1beta1
{{- else -}}
{{- fail "externalSecrets.enabled is true but this cluster has no External Secrets Operator (no external-secrets.io CRDs). Install it first (helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace --set installCRDs=true; scripts/k3s_install.sh does this for you), or set externalSecrets.enabled=false to keep the chart's own Kubernetes Secrets." -}}
{{- end -}}
{{- end -}}

