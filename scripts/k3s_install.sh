#!/usr/bin/env bash
# set -e
IS_WSL=false
# The domain, e.g. example.com: the auth-server is served at auth.<domain>. AUTH_HOST (--auth-host) changes that
# name, as a bare label ("rapidrest" -> rapidrest.<domain>) or a whole host name.
DOMAIN="cluster.local"
AUTH_HOST=${AUTH_HOST:-auth}
TLS=true
VERSION="1.0.0-beta.2"
NAMESPACE="auth-server"
# The published chart: the CI pushes ./helm (chart name "auth-server") to oci://ghcr.io/<owner>/charts. Set CHART to
# a local chart directory (e.g. CHART=./helm) to install from a checkout instead; --version is then ignored.
CHART=${CHART:-oci://ghcr.io/rapidrest/charts/auth-server}
# Envoy Gateway release (https://github.com/envoyproxy/gateway/releases). Pinned: v0.0.0-latest tracks main.
ENVOY_GATEWAY_VERSION=${ENVOY_GATEWAY_VERSION:-v1.9.1}
# External Secrets release (https://github.com/external-secrets/external-secrets), which the chart's OpenBao support
# needs: it copies the vault's values into the Kubernetes Secrets the pod reads.
EXTERNAL_SECRETS_VERSION=${EXTERNAL_SECRETS_VERSION:-2.10.0}
# OpenBao (https://openbao.org) is where the release keeps its JWT, cookie and session secrets. Like cert-manager it's
# installed here rather than by the chart, because it's a cluster service several releases can share - the RapidMX
# server's chart points its bundled auth-server at the same vault so both ends read one JWT secret. --openbao false
# keeps the secrets in Kubernetes Secrets instead.
OPENBAO=true
OPENBAO_VERSION=${OPENBAO_VERSION:-0.29.4}
OPENBAO_NAMESPACE=${OPENBAO_NAMESPACE:-openbao}
# The image the unsealer runs; only needs the `bao` CLI, so it's the same one the vault uses.
OPENBAO_IMAGE=${OPENBAO_IMAGE:-openbao/openbao:2.6.2}
OPENBAO_STORAGE_SIZE=${OPENBAO_STORAGE_SIZE:-1Gi}
# An OpenBao this cluster already runs, e.g. http://openbao.openbao.svc:8200. Set it and this script installs none,
# leaving the kv path and the token Secret for you to create - see "Secrets and OpenBao" in README.md.
OPENBAO_ADDRESS=${OPENBAO_ADDRESS:-}
OPENBAO_POD=openbao-0
OPENBAO_LOCAL_ADDRESS=http://127.0.0.1:8200
# Holds the unseal key and the root token: this is what makes the vault unseal itself after a restart, and what an
# attacker who can read Secrets in that namespace would get.
OPENBAO_KEYS_SECRET=openbao-keys
# The kv v2 mount, which must match the chart's global.openbao.kvMount.
OPENBAO_KV_MOUNT=${OPENBAO_KV_MOUNT:-secret}
# The chart creates this Gateway itself (its global.gateway defaults), in the release's namespace, on the envoy class below.
# Its name is "<fullname>-gateway", so GATEWAY_NAME is set once FULLNAME is known.
GATEWAY_NAMESPACE=$NAMESPACE
GATEWAY_NAME=
ENVOY_NAMESPACE=envoy-gateway-system
# Let's Encrypt account email for the chart's Issuer. Defaults to admin@<domain> (a bare host name isn't a valid domain).
ACME_EMAIL=${ACME_EMAIL:-}
UNINSTALL=false
SKIP_K3S=false
# The user the kubeconfig is installed for: the one who ran `sudo ./k3s_install.sh`, or the current user.
INSTALL_USER=${SUDO_USER:-`id -un`}
INSTALL_HOME=`getent passwd "$INSTALL_USER" | cut -d: -f6`
INSTALL_HOME=${INSTALL_HOME:-$HOME}
USER_KUBECONFIG="$INSTALL_HOME/.kube/config"
K3S_KUBECONFIG=/etc/rancher/k3s/k3s.yaml
K3S_OPTIONS="--disable=traefik"
# Markers around the block this script appends to nginx.conf, so a re-run replaces it instead of adding another.
NGINX_CONF=/etc/nginx/nginx.conf
NGINX_BEGIN="# BEGIN auth-server"
NGINX_END="# END auth-server"
# Prefix of the nginx.conf lines this script commented out (http server blocks listening on port 80); --uninstall
# restores them.
NGINX_DISABLED_PREFIX="#auth-server# "
# What this script installed itself (as opposed to found already there), one key=value per line, so --uninstall only
# removes that.
STATE_DIR=/var/lib/auth-server-installer
STATE_FILE="$STATE_DIR/state"
# The host firewall rules this script added, one per line: "firewalld <zone> <kind> <value>" (e.g.
# "firewalld public port 80/tcp") or "ufw <rule>" (e.g. "ufw allow 80/tcp").
FIREWALL_RULES="$STATE_DIR/firewall"
# Internal vars
LINES=$(tput lines 2>/dev/null || echo 24)
COLS=$(tput cols 2>/dev/null || echo 80)
total_steps=7
current=0
current_step="Initializing..."
previous_step=""
progress_pid=""
running=true

# Shared functions
function addHelmRepo() {
  REPO_NAME=$1
  REPO_URL=$2
  if [[ `helm repo list 2>/dev/null | awk '{print $1}' | grep -Fx "$REPO_NAME" | wc -l` -eq 0 ]]; then
    echo "Adding helm repo $REPO_NAME - $REPO_URL"
    helm repo add "$REPO_NAME" "$REPO_URL"
  fi
}

function draw_progress() {
  local cur="$current"
  local step="$current_step"
  local current_step_length=${#step}
  local template="%s... [%d/%d]%s %d%% "
  local template_length=${#template}
  template_length=$(( template_length + current_step_length ))
  local bar_char='|'
  local percent_done=$(( cur * 100 / total_steps ))
  local length=$(( COLS - template_length ))
  local num_bars=$(( percent_done * length / 100 ))

  local i
  local s='['
  for ((i = 0; i < num_bars; i++)); do
    s+=$bar_char
  done
  for ((i = num_bars; i < length; i++)); do
    s+=' '
  done
  s+=']'

  printf '\e7' # save the cursor location
  printf '\e[%d;%dH' "$LINES" 0 # move cursor to the bottom line
  printf '\e[0K' # clear the line
  if [[ $cur -gt 0 ]]; then
    printf "$template" "$step" "$cur" "$total_steps" "$s" "$percent_done" # print the progress bar
  else
    printf ""
  fi
  printf '\e8' # restore the cursor location
}

# Background refresher
function progress_loop() {
  if [[ "$1" != "--bg" ]]; then
      echo "ERROR: progress_loop must be run in background" >&2
      exit 1
  fi

  echo
  while $running; do
      draw_progress
      sleep 0.2
  done
}

function run_step() {
  previous_step="$current_step"
  current_step="$1"
  if [[ "$previous_step" != "" ]]; then
    local step_length=${#previous_step}
    local length=$(( COLS - step_length - 15 ))
    local s=''
    local i
    for ((i = 0; i < length; i++)); do
      s+=' '
    done
    printf "[%d/%d] %s...%s[\e[32mDone\e[0m]\n" "$current" "$total_steps" "$previous_step" "$s"
  fi
  current=$(( current + 1 ))
  draw_progress
}

function cleanup() {
  running=false
  if [[ -n "$progress_pid" ]] && kill -0 "$progress_pid" 2>/dev/null; then
      kill "$progress_pid" 2>/dev/null
      wait "$progress_pid" 2>/dev/null
  fi
}

# Waits (up to 30 minutes) until namespace $1 has Deployments and all of them are Available. Used instead of counting
# pods that aren't "Running", which never settles when a namespace has a completed Job pod (cert-manager's
# startupapicheck).
function waitForDeployments() {
  local ns=$1
  local name=$2
  echo "Checking $name has started..."
  local startTime
  startTime=`date +%s`
  until [[ `kubectl -n "$ns" get deployments --no-headers 2>/dev/null | wc -l` -gt 0 ]]; do
    if [[ $(( `date +%s` - startTime )) -ge 1800 ]]; then
      echo "There was a problem installing $name..."
      exit 1
    fi
    echo "Waiting for $name to start..."
    sleep 5
  done
  if ! kubectl -n "$ns" wait --for=condition=Available deployment --all --timeout=30m; then
    echo "There was a problem installing $name..."
    exit 1
  fi
  echo "$name is running!"
}

# Copies k3s' cluster-admin kubeconfig to the installing user's ~/.kube/config, readable only by that user.
function installKubeconfig() {
  local group
  group=`id -gn "$INSTALL_USER"`
  sudo install -d -m 0700 -o "$INSTALL_USER" -g "$group" "$INSTALL_HOME/.kube"
  if sudo test -f "$USER_KUBECONFIG" && ! sudo cmp -s "$K3S_KUBECONFIG" "$USER_KUBECONFIG"; then
    local backup
    backup="$USER_KUBECONFIG.bak.`date +%s`"
    echo "Backing up the existing $USER_KUBECONFIG to $backup"
    sudo cp -p "$USER_KUBECONFIG" "$backup"
  fi
  sudo install -m 0600 -o "$INSTALL_USER" -g "$group" "$K3S_KUBECONFIG" "$USER_KUBECONFIG"
  # Earlier versions of this script exported KUBECONFIG=/etc/rancher/k3s/k3s.yaml from ~/.bashrc, which is no longer
  # readable by the user.
  if [[ -f "$INSTALL_HOME/.bashrc" ]]; then
    sudo sed -i "\#^export KUBECONFIG=$K3S_KUBECONFIG\$#d" "$INSTALL_HOME/.bashrc"
  fi
}

# The host name for label $2 in domain $1: a bare label ("auth") becomes auth.<domain>, anything containing a dot is
# taken as the whole host name.
function hostFor() {
  case "$2" in
    *.*) echo "$2";;
    *) echo "$2.$1";;
  esac
}

# Single-quotes a value for YAML.
function yamlQuote() {
  local value=${1//\'/\'\'}
  printf "'%s'" "$value"
}

# Single-quotes a value for sh, for a command that runs inside the OpenBao pod.
function shQuote() {
  local value=${1//\'/\'\\\'\'}
  printf "'%s'" "$value"
}

# Records that this script installed $1 (the value, e.g. how, is $2). The first record wins: a re-run that finds the
# item already there doesn't forget that this script installed it.
function recordInstalled() {
  sudo install -d -m 0755 "$STATE_DIR"
  if ! sudo grep -q "^$1=" "$STATE_FILE" 2>/dev/null; then
    echo "$1=${2:-true}" | sudo tee -a "$STATE_FILE" > /dev/null
  fi
}

# The value recordInstalled stored for $1, or nothing when this script didn't install it.
function installedBy() {
  sudo sed -n "s/^$1=//p" "$STATE_FILE" 2>/dev/null | head -n 1
}

# Comments out (with $NGINX_DISABLED_PREFIX) each server {} block directly inside http {} of nginx.conf that listens on
# port 80, such as the default server of the stock RHEL/Fedora nginx.conf: the stream {} proxy below needs port 80, and
# nginx fails to start while an http server binds it too. Already commented lines are ignored, so it's idempotent.
function disablePort80HttpServers() {
  local tmp
  tmp=`mktemp`
  # Reads nginx.conf as root; the output goes to this user's own temporary file.
  # shellcheck disable=SC2024
  sudo awk -v prefix="$NGINX_DISABLED_PREFIX" '
    function flush(disable,   i) {
      for (i = 1; i <= n; i++) print (disable ? prefix : "") buf[i]
      n = 0
    }
    {
      code = $0
      sub(/#.*/, "", code)
      if (depth == 0 && code ~ /^[[:space:]]*http[[:space:]]*\{/) inHttp = 1
      if (inHttp && depth == 1 && !inServer && code ~ /^[[:space:]]*server[[:space:]]*\{/) { inServer = 1; listens80 = 0 }
      if (inServer && code ~ /(^|[[:space:]])listen[[:space:]]+([^[:space:];]*:)?80([[:space:];]|$)/) listens80 = 1
      depth += gsub(/\{/, "{", code) - gsub(/\}/, "}", code)
      if (inServer) {
        buf[++n] = $0
        if (depth <= 1) { flush(listens80); inServer = 0; if (listens80) disabled = 1 }
      } else {
        print
      }
      if (depth <= 0) inHttp = 0
    }
    END { flush(0); exit disabled ? 0 : 3 }
  ' "$NGINX_CONF" > "$tmp"
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "Commenting out the http server block(s) in $NGINX_CONF that listen on port 80 (restored by --uninstall)."
    sudo cp "$tmp" "$NGINX_CONF"
    recordInstalled nginx_port80_servers disabled
  fi
  rm -f "$tmp"
}

# The active host firewall: "firewalld" (RHEL/Fedora's default, also installable on Debian), "ufw" (Ubuntu's, also
# installable on Debian), or nothing (e.g. Debian's default, or a firewall this script doesn't manage). Both commands live
# in /usr/sbin, which is only on sudo's PATH on Debian.
function activeFirewall() {
  if systemctl is-active --quiet firewalld 2>/dev/null; then
    echo firewalld
  elif sudo ufw status 2>/dev/null | grep -q '^Status: active'; then
    echo ufw
  fi
}

# Runs `ufw allow $@`; succeeds only when that added the rule. ufw answers "Skipping adding existing rule" for one that
# was already there (the user's own, which --uninstall must leave alone) and "Rules updated" when it added it.
function ufwAllow() {
  sudo ufw allow "$@" 2>&1 | grep -q '^Rules updated'
}

function recordFirewallRule() {
  sudo install -d -m 0755 "$STATE_DIR"
  echo "$*" | sudo tee -a "$FIREWALL_RULES" > /dev/null
}

# Lets traffic from CIDR $1 reach this host (k3s' pod and service networks) in the active firewall, unless already
# allowed, recording the rule for --uninstall.
function firewallTrustSource() {
  case "`activeFirewall`" in
    firewalld)
      if ! sudo firewall-cmd --permanent --zone=trusted "--query-source=$1" >/dev/null 2>&1 \
          && sudo firewall-cmd --permanent --zone=trusted "--add-source=$1" >/dev/null; then
        recordFirewallRule firewalld trusted source "$1"
        sudo firewall-cmd --reload >/dev/null
      fi
      ;;
    ufw)
      if ufwAllow from "$1" to any; then
        recordFirewallRule ufw allow from "$1" to any
      fi
      ;;
  esac
}

# Opens port $1 (e.g. 80/tcp) in the active firewall, unless already open, recording the rule for --uninstall.
function firewallOpenPort() {
  case "`activeFirewall`" in
    firewalld)
      local zone
      zone=`sudo firewall-cmd --get-default-zone`
      if ! sudo firewall-cmd --permanent --zone="$zone" "--query-port=$1" >/dev/null 2>&1 \
          && sudo firewall-cmd --permanent --zone="$zone" "--add-port=$1" >/dev/null; then
        recordFirewallRule firewalld "$zone" port "$1"
        sudo firewall-cmd --reload >/dev/null
      fi
      ;;
    ufw)
      if ufwAllow "$1"; then
        recordFirewallRule ufw allow "$1"
      fi
      ;;
  esac
}

# Reads field $1 (a jsonpath) of the Service Envoy Gateway created for the Gateway. Envoy Gateway runs it in its own
# namespace, whatever namespace the Gateway is in.
function gatewayService() {
  kubectl -n "$ENVOY_NAMESPACE" get svc -o jsonpath="{.items[0]$1}" 2>/dev/null \
    -l "gateway.envoyproxy.io/owning-gateway-name=$GATEWAY_NAME,gateway.envoyproxy.io/owning-gateway-namespace=$GATEWAY_NAMESPACE"
}

# The value of key $2 in Secret $1 of the release's namespace, or nothing - so the secrets a release already uses are
# carried into the vault rather than replaced, which would sign every user out and invalidate every issued token.
function existingSecret() {
  local name value
  for name in "$NAMESPACE-$1" "$NAMESPACE-auth-server-$1"; do
    value=`kubectl -n "$NAMESPACE" get secret "$name" -o jsonpath="{.data.$2}" 2>/dev/null | base64 -d 2>/dev/null`
    if [[ -n "$value" ]]; then
      echo "$value"
      return
    fi
  done
}

# Installs OpenBao and leaves it initialised and unsealed, with the unseal key and root token in $OPENBAO_KEYS_SECRET and
# a small Deployment beside it that unseals the vault again whenever it comes back sealed - which a pod restart, an
# upgrade and a node reboot all do. Keeping that key in a Secret is the trade for a vault that heals itself unattended:
# anyone who can read Secrets in that namespace can unseal it, which is roughly what those Secrets gave away before.
# A cluster with a KMS to auto-unseal from should run its own vault and be named with OPENBAO_ADDRESS instead.
function installOpenbao() {
  addHelmRepo openbao https://openbao.github.io/openbao-helm
  helm repo update openbao >/dev/null
  local isNew=false
  if ! helm status openbao -n "$OPENBAO_NAMESPACE" >/dev/null 2>&1; then
    isNew=true
  fi
  # Standalone with file storage on a PVC: one node, one vault. injector.enabled=false because nothing here uses the
  # sidecar injector - External Secrets delivers the values instead.
  if ! helm upgrade --install openbao openbao/openbao --version "$OPENBAO_VERSION" \
      -n "$OPENBAO_NAMESPACE" --create-namespace \
      --set injector.enabled=false \
      --set server.standalone.enabled=true \
      --set server.dataStorage.enabled=true \
      --set server.dataStorage.size="$OPENBAO_STORAGE_SIZE"; then
    echo "There was a problem installing OpenBao."
    exit 1
  fi
  if [[ "$isNew" = "true" ]]; then
    recordInstalled openbao "$OPENBAO_NAMESPACE"
  fi

  # A sealed vault never reports Ready, and it is sealed until the next step, so this waits for the pod to answer rather
  # than for readiness. `bao status` exits non-zero while sealed but still prints the status, which is what's checked.
  echo "Waiting for OpenBao to start..."
  local startTime
  startTime=`date +%s`
  until kubectl -n "$OPENBAO_NAMESPACE" exec "$OPENBAO_POD" -- bao status -address="$OPENBAO_LOCAL_ADDRESS" -format=json 2>/dev/null | grep -q '"sealed"'; do
    if [[ $(( `date +%s` - startTime )) -ge 600 ]]; then
      echo "There was a problem starting OpenBao: $OPENBAO_POD in namespace $OPENBAO_NAMESPACE doesn't answer."
      exit 1
    fi
    sleep 5
  done

  if kubectl -n "$OPENBAO_NAMESPACE" get secret "$OPENBAO_KEYS_SECRET" >/dev/null 2>&1; then
    OPENBAO_UNSEAL_KEY=`kubectl -n "$OPENBAO_NAMESPACE" get secret "$OPENBAO_KEYS_SECRET" -o jsonpath='{.data.unseal_key}' | base64 -d`
    OPENBAO_ROOT_TOKEN=`kubectl -n "$OPENBAO_NAMESPACE" get secret "$OPENBAO_KEYS_SECRET" -o jsonpath='{.data.root_token}' | base64 -d`
    if [[ -z "$OPENBAO_UNSEAL_KEY" || -z "$OPENBAO_ROOT_TOKEN" ]]; then
      echo "The $OPENBAO_KEYS_SECRET Secret in namespace $OPENBAO_NAMESPACE has no unseal_key/root_token, so this vault"
      echo "can't be unsealed or configured from here. Delete the Secret only if the vault's data is gone too, or point"
      echo "this script at a prepared vault with OPENBAO_ADDRESS."
      exit 1
    fi
  else
    echo "Initialising OpenBao..."
    # One key share, because the thing that unseals this vault is a Deployment, not a group of people.
    local init
    if ! init=`kubectl -n "$OPENBAO_NAMESPACE" exec "$OPENBAO_POD" -- bao operator init -address="$OPENBAO_LOCAL_ADDRESS" -key-shares=1 -key-threshold=1 -format=json`; then
      echo "There was a problem initialising OpenBao."
      exit 1
    fi
    OPENBAO_UNSEAL_KEY=`printf '%s' "$init" | tr -d ' \n' | sed -n 's/.*"unseal_keys_b64":\["\([^"]*\)".*/\1/p'`
    OPENBAO_ROOT_TOKEN=`printf '%s' "$init" | tr -d ' \n' | sed -n 's/.*"root_token":"\([^"]*\)".*/\1/p'`
    if [[ -z "$OPENBAO_UNSEAL_KEY" || -z "$OPENBAO_ROOT_TOKEN" ]]; then
      echo "OpenBao was initialised but its unseal key and root token couldn't be read back, so nothing can unseal it."
      echo "The vault's storage has to be deleted and this script re-run:"
      echo "  helm uninstall openbao -n $OPENBAO_NAMESPACE && kubectl delete pvc -n $OPENBAO_NAMESPACE --all"
      exit 1
    fi
    # Written from files, so neither value passes through this host's process list.
    local dir
    dir=`mktemp -d`
    chmod 700 "$dir"
    printf '%s' "$OPENBAO_UNSEAL_KEY" > "$dir/unseal_key"
    printf '%s' "$OPENBAO_ROOT_TOKEN" > "$dir/root_token"
    if ! kubectl -n "$OPENBAO_NAMESPACE" create secret generic "$OPENBAO_KEYS_SECRET" \
        --from-file="$dir/unseal_key" --from-file="$dir/root_token"; then
      rm -rf "$dir"
      echo "There was a problem storing OpenBao's unseal key, which leaves a vault nothing can unseal. Remove it and"
      echo "re-run this script: helm uninstall openbao -n $OPENBAO_NAMESPACE && kubectl delete pvc -n $OPENBAO_NAMESPACE --all"
      exit 1
    fi
    rm -rf "$dir"
  fi

  if ! kubectl -n "$OPENBAO_NAMESPACE" exec "$OPENBAO_POD" -- bao status -address="$OPENBAO_LOCAL_ADDRESS" -format=json 2>/dev/null | tr -d ' ' | grep -q '"sealed":false'; then
    echo "Unsealing OpenBao..."
    # `bao operator unseal` takes the key only as an argument (it refuses stdin and, unlike Vault, "-"), so a shell in the
    # pod reads it from stdin and passes it on: it isn't in this host's process list.
    if ! printf '%s\n' "$OPENBAO_UNSEAL_KEY" | kubectl -n "$OPENBAO_NAMESPACE" exec -i "$OPENBAO_POD" -- \
        sh -c 'read -r key && exec bao operator unseal -address="$1" "$key"' sh "$OPENBAO_LOCAL_ADDRESS" >/dev/null; then
      echo "There was a problem unsealing OpenBao."
      exit 1
    fi
  fi

  # The unsealer: it does nothing while the vault is unsealed, and unseals it within ten seconds of it coming back.
  if ! cat << EOF | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openbao-unsealer
  namespace: $OPENBAO_NAMESPACE
  labels:
    app.kubernetes.io/name: openbao-unsealer
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: openbao-unsealer
  template:
    metadata:
      labels:
        app.kubernetes.io/name: openbao-unsealer
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 100
        runAsGroup: 1000
      containers:
        - name: unsealer
          image: $OPENBAO_IMAGE
          command: ["/bin/sh", "-c"]
          args:
            - |
              while true; do
                if bao status -format=json 2>/dev/null | tr -d ' ' | grep -q '"sealed":true'; then
                  if bao operator unseal "\$UNSEAL_KEY" >/dev/null 2>&1; then
                    echo "Unsealed OpenBao."
                  else
                    echo "Could not unseal OpenBao; retrying."
                  fi
                fi
                sleep 10
              done
          env:
            - name: BAO_ADDR
              value: $OPENBAO_ADDRESS
            - name: UNSEAL_KEY
              valueFrom:
                secretKeyRef:
                  name: $OPENBAO_KEYS_SECRET
                  key: unseal_key
          resources:
            requests:
              cpu: 10m
              memory: 32Mi
            limits:
              memory: 64Mi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
EOF
  then
    echo "There was a problem installing the OpenBao unsealer, so the vault would stay sealed after a restart."
    exit 1
  fi
  echo "OpenBao is running and unsealed."
}

# Prepares the vault for this release: the kv v2 mount, this release's JWT, cookie and session secrets, and a read-only
# token for External Secrets to fetch them with. It all runs inside the vault's own pod, over stdin, so no token or
# secret reaches either host's process list; re-running it changes nothing that already exists.
function prepareOpenbao() {
  local needEsoToken=true
  if kubectl -n "$NAMESPACE" get secret "$OPENBAO_ESO_SECRET" >/dev/null 2>&1; then
    needEsoToken=false
  fi
  local out
  out=`mktemp "${TMPDIR:-/tmp}/openbao-tokens.XXXXXX"`
  chmod 600 "$out"
  if ! kubectl -n "$OPENBAO_NAMESPACE" exec -i "$OPENBAO_POD" -- sh -s > "$out" << EOF
set -e
export BAO_ADDR=$OPENBAO_LOCAL_ADDRESS
export BAO_TOKEN=`shQuote "$OPENBAO_ROOT_TOKEN"`

# The kv v2 engine the chart reads this release's secrets from (its global.openbao.kvMount).
bao secrets list -format=json | grep -q '"$OPENBAO_KV_MOUNT/"' || bao secrets enable -path=$OPENBAO_KV_MOUNT -version=2 kv > /dev/null

# A value already in the vault always wins, so an upgrade never re-keys anything.
seed() {
  if [ -n "\`bao kv get -mount=$OPENBAO_KV_MOUNT -field="\$1" $OPENBAO_SECRETS_PATH 2> /dev/null\`" ]; then
    return 0
  fi
  bao kv patch -mount=$OPENBAO_KV_MOUNT $OPENBAO_SECRETS_PATH "\$1=\$2" > /dev/null 2>&1 ||
    bao kv put -mount=$OPENBAO_KV_MOUNT $OPENBAO_SECRETS_PATH "\$1=\$2" > /dev/null
}
seed auth_secret `shQuote "$AUTH_SECRET"`
seed cookie_secret `shQuote "$COOKIE_SECRET"`
seed session__secret `shQuote "$SESSION_SECRET"`

printf 'path "$OPENBAO_KV_MOUNT/data/$OPENBAO_SECRETS_PATH" {\n  capabilities = ["read"]\n}\npath "$OPENBAO_KV_MOUNT/metadata/$OPENBAO_SECRETS_PATH" {\n  capabilities = ["read"]\n}\n' | bao policy write $FULLNAME-secrets-read - > /dev/null

# A periodic token with a very long period: nothing here renews it, and a token that expires takes the deployment down
# with it. It is an orphan so revoking the root token doesn't revoke it.
bao auth tune -max-lease-ttl=87600h token/ > /dev/null
if [ "$needEsoToken" = "true" ]; then
  echo "eso_token=\`bao token create -policy=$FULLNAME-secrets-read -orphan -period=87600h -display-name=$FULLNAME-eso -field=token\`"
fi
EOF
  then
    rm -f "$out"
    echo "There was a problem preparing OpenBao for this release."
    exit 1
  fi

  # The Secret External Secrets reads its token from. It belongs to the release's namespace, which helm hasn't
  # necessarily created yet.
  kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  local dir token
  dir=`mktemp -d`
  chmod 700 "$dir"
  token=`sed -n 's/^eso_token=//p' "$out"`
  if [[ -n "$token" ]]; then
    printf '%s' "$token" > "$dir/token"
    kubectl -n "$NAMESPACE" create secret generic "$OPENBAO_ESO_SECRET" --from-file="$dir/token" >/dev/null
  fi
  rm -rf "$dir"
  rm -f "$out"
  echo "OpenBao holds this release's secrets at $OPENBAO_KV_MOUNT/$OPENBAO_SECRETS_PATH."
}

function uninstall() {
  if [[ -z "$KUBECONFIG" && -f "$USER_KUBECONFIG" ]]; then
    export KUBECONFIG="$USER_KUBECONFIG"
  fi
  if ! sudo test -f "$STATE_FILE"; then
    echo "$STATE_FILE doesn't exist, so there is no record of what this script installed (or an earlier version of it"
    echo "did the install). Only this script's nginx configuration is removed; remove k3s, helm and nginx manually if"
    echo "this script installed them."
  fi
  if [[ "`installedBy k3s`" = "true" ]]; then
    # Removes the whole cluster, with everything this script installed into it.
    echo "Removing k3s..."
    sudo /usr/local/bin/k3s-uninstall.sh
  else
    local release
    release=`installedBy release`
    if [[ -n "$release" ]]; then
      echo "Removing the auth-server release (including its data volumes)..."
      helm uninstall "$release" -n "$release"
    fi
    if [[ "`installedBy cluster_issuer`" = "true" ]]; then
      # Made by earlier versions of this script; the chart has its own Issuer now.
      echo "Removing the letsencrypt-prod ClusterIssuer..."
      kubectl delete clusterissuer letsencrypt-prod --ignore-not-found
    fi
    local openbaoNamespace
    openbaoNamespace=`installedBy openbao`
    if [[ -n "$openbaoNamespace" ]]; then
      echo "Removing OpenBao, with the unseal key and everything the vault held..."
      kubectl -n "$openbaoNamespace" delete deployment openbao-unsealer --ignore-not-found
      helm uninstall openbao -n "$openbaoNamespace"
      kubectl delete namespace "$openbaoNamespace" --ignore-not-found
    fi
    if [[ "`installedBy external_secrets`" = "true" ]]; then
      echo "Removing external-secrets..."
      helm uninstall external-secrets -n external-secrets
    fi
    if [[ "`installedBy cert_manager`" = "true" ]]; then
      echo "Removing cert-manager..."
      helm uninstall cert-manager -n cert-manager
    fi
    if [[ "`installedBy proxy_protocol_policy`" = "true" ]]; then
      # The Gateway itself belongs to the release, and goes with it.
      kubectl -n "$GATEWAY_NAMESPACE" delete clienttrafficpolicy "$GATEWAY_NAME-proxy-protocol" --ignore-not-found
    fi
    if [[ "`installedBy envoy_gateway_class`" = "true" ]]; then
      echo "Removing the envoy GatewayClass..."
      kubectl delete gatewayclass envoy --ignore-not-found
      kubectl -n "$ENVOY_NAMESPACE" delete envoyproxy bare-metal-proxy --ignore-not-found
    fi
    if [[ "`installedBy envoy_gateway`" = "true" ]]; then
      echo "Removing envoy-gateway..."
      helm uninstall eg -n "$ENVOY_NAMESPACE"
    fi
  fi

  local nginxInstalledBy
  nginxInstalledBy=`installedBy nginx`
  if [[ -f "$NGINX_CONF" ]]; then
    if sudo grep -qxF "$NGINX_BEGIN" "$NGINX_CONF"; then
      echo "Removing this script's block from $NGINX_CONF..."
      sudo sed -i "/^$NGINX_BEGIN\$/,/^$NGINX_END\$/d" "$NGINX_CONF"
    fi
    if sudo grep -qF "$NGINX_DISABLED_PREFIX" "$NGINX_CONF"; then
      echo "Restoring the http server block(s) this script commented out..."
      sudo sed -i "s/^$NGINX_DISABLED_PREFIX//" "$NGINX_CONF"
    fi
  fi
  if [[ "`installedBy nginx_default_site`" = "moved" ]] && sudo test -e "$STATE_DIR/sites-enabled-default"; then
    sudo mv "$STATE_DIR/sites-enabled-default" /etc/nginx/sites-enabled/default
  fi
  if [[ "$nginxInstalledBy" = "dnf" ]]; then
    echo "Removing nginx..."
    sudo dnf remove nginx nginx-mod-stream -y
  elif [[ "$nginxInstalledBy" = "apt" ]]; then
    echo "Removing nginx..."
    sudo apt-get remove nginx libnginx-mod-stream -y
  elif command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    sudo systemctl restart nginx
  fi
  if [[ "`installedBy selinux_nginx_relay`" = "true" ]]; then
    sudo setsebool -P httpd_can_network_relay 0
  fi
  if sudo test -f "$FIREWALL_RULES"; then
    echo "Removing the firewall rules this script added..."
    local tool args
    while read -r tool args; do
      case "$tool" in
        firewalld)
          # shellcheck disable=SC2086 # "<zone> <kind> <value>", none of which contain spaces.
          set -- $args
          sudo firewall-cmd --permanent --zone="$1" "--remove-$2=$3" >/dev/null
          sudo firewall-cmd --reload >/dev/null
          ;;
        ufw)
          # shellcheck disable=SC2086 # The rule's words, e.g. "allow from 10.42.0.0/16 to any".
          sudo ufw delete $args >/dev/null
          ;;
      esac
    done < <(sudo cat "$FIREWALL_RULES")
    sudo rm -f "$FIREWALL_RULES"
  fi

  case "`installedBy helm`" in
    snap)
      echo "Removing helm..."
      sudo snap remove helm
      ;;
    script)
      echo "Removing helm..."
      sudo rm -f /usr/local/bin/helm
      ;;
  esac

  sudo rm -f "$STATE_FILE"
  echo "Uninstall complete! $USER_KUBECONFIG was left in place; delete it if it only held this cluster."
}

GETOPT=$(getopt -o h --long domain:,auth-host:,version:,tls:,openbao:,email:,uninstall,install-cert-manager,skip-k3s,help -- "$@")
if [ $? -ne 0 ]; then
  exit 1
fi
eval set -- "$GETOPT"
while true
do
    case "$1" in
        --domain) DOMAIN=$2; shift 2;;
        --auth-host) AUTH_HOST=$2; shift 2;;
        --version) VERSION=$2; shift 2;;
        --tls) TLS=$2; shift 2;;
        --openbao) OPENBAO=$2; shift 2;;
        --email) ACME_EMAIL=$2; shift 2;;
        --skip-k3s) SKIP_K3S=true; shift;;
        --uninstall) UNINSTALL=true; shift;;
        --install-cert-manager) TLS=true; shift;;
        -h | --help)
          echo "This scripts sets up a complete single-node k3s (Kubernetes) cluster. No arguments will do an install"
          echo "During install this will install the following:"
          echo -e "\tk3s - Kubernetes distribution (includes kubectl)"
          echo -e "\thelm - Helm to handle install/update software in k3s"
          echo -e "\tenvoy-gateway - Gateway API implementation routing traffic to the services"
          echo -e "\tnginx - Nginx to forward ports 80 and 443 to envoy-gateway"
          echo -e "\tcert-manager - Let's Encrypt certificates (with --tls true)"
          echo -e "\topenbao - the vault holding the release's secrets (with --openbao true)"
          echo -e "\texternal-secrets - delivers the chart's OpenBao-held secrets into Kubernetes Secrets"
          echo -e "\tauth-server - the auth-server itself, with its own Gateway"

          echo "Usage:"
          echo -e "\t--domain <domain>\t\tThe domain, e.g. example.com: the auth-server is at auth.<domain>"
          echo -e "\t--auth-host <name>\t\tThe auth-server's host name or label (default auth, i.e. auth.<domain>)"
          echo -e "\t--version <version>\t\tThe version of auth-server to deploy"
          echo -e "\t--tls <true|false>\t\tInstalls cert manager and enables TLS ingress support (uses Let's Encrypt)"
          echo -e "\t--openbao <true|false>\t\tInstalls OpenBao and keeps the release's secrets in it (default true;"
          echo -e "\t\t\t\tfalse keeps them in Kubernetes Secrets)"
          echo -e "\t--email <email>\t\tThe Let's Encrypt account email (default admin@<domain>)"
          echo -e "\t--skip-k3s\t\tSkips installation of k3s"
          echo -e "\t--uninstall\t\tUninstalls what this script installed (recorded in $STATE_FILE)"
          echo "Environment:"
          echo -e "\tCHART\t\t\tThe chart to install (default $CHART), e.g. ./helm for a local checkout"
          echo -e "\tENVOY_GATEWAY_VERSION\tThe envoy-gateway release to install (default $ENVOY_GATEWAY_VERSION)"
          echo -e "\tEXTERNAL_SECRETS_VERSION\tThe external-secrets release to install (default $EXTERNAL_SECRETS_VERSION)"
          echo -e "\tOPENBAO_VERSION\t\tThe openbao chart to install (default $OPENBAO_VERSION)"
          echo -e "\tOPENBAO_ADDRESS\t\tAn OpenBao this cluster already runs, used instead of installing one"
          exit 1
          ;;
        --) shift; break;;
        *) break;;
    esac
done
if [[ "$TLS" != "true" && "$TLS" != "false" ]]; then
  echo "--tls must be true or false."
  exit 1
fi
if [[ "$OPENBAO" != "true" && "$OPENBAO" != "false" ]]; then
  echo "--openbao must be true or false."
  exit 1
fi
# With OPENBAO_ADDRESS the vault is yours: this script neither installs nor prepares one, it only points the chart at it.
OPENBAO_INSTALL=false
if [[ "$OPENBAO" = "true" && -z "$OPENBAO_ADDRESS" ]]; then
  OPENBAO_INSTALL=true
  OPENBAO_ADDRESS="http://openbao.$OPENBAO_NAMESPACE.svc:8200"
fi
ACME_EMAIL=${ACME_EMAIL:-admin@$DOMAIN}
AUTH_HOST=`hostFor "$DOMAIN" "$AUTH_HOST"`
# The chart's resource prefix (its "rrst.fullname"): the release name, suffixed with the chart name unless it already
# contains it. The vault's path and token Secret are named after it.
FULLNAME=$NAMESPACE
if [[ "$NAMESPACE" != *auth-server* ]]; then
  FULLNAME="$NAMESPACE-auth-server"
fi
GATEWAY_NAME="$FULLNAME-gateway"
OPENBAO_SECRETS_PATH="$FULLNAME/secrets"
OPENBAO_ESO_SECRET="$FULLNAME-openbao-eso"
if [[ "$TLS" = "false" ]]; then
  # No cert-manager step.
  total_steps=$(( total_steps - 1 ))
fi
if [[ "$OPENBAO_INSTALL" = "true" ]]; then
  # One more step for the vault itself; external-secrets is already counted.
  total_steps=$(( total_steps + 1 ))
elif [[ "$OPENBAO" = "false" ]]; then
  # And none for external-secrets either: without a vault the chart renders its own Kubernetes Secrets.
  total_steps=$(( total_steps - 1 ))
fi

if [[ "$UNINSTALL" = "true" ]]; then
  uninstall
  exit 0
fi

# Catch Ctrl-C, kill, termination, normal exit
trap cleanup EXIT INT TERM

# Start background progress bar
#progress_loop --bg &
#progress_pid=$!

# Detect the OS distribution and set the correct package manager
run_step "Updating system packages"
if [[ -e /etc/redhat-release ]]; then
  echo "Detected RHEL based operating system."
  sudo dnf check-update
elif grep -qi Microsoft /proc/version; then
  echo "Bash is running on WSL"
  sudo apt -qq update
  IS_WSL=true
# Check if /etc/debian_version exists
elif [[ -e /etc/debian_version ]]; then
  echo "Detected Debian/Ubuntu based operating system."
  sudo apt-get update
else
  echo "Unable to determine Linux distribution."
  exit 1
fi

# For WSL check for another installation
run_step "Installing kubernetes (k3s)"
if [[ "$IS_WSL" = "true" ]]; then
  if [[ `kubectl get nodes 2>/dev/null | grep ' Ready ' | wc -l` -eq 1 ]]; then
    SKIP_K3S=true
    echo "Skipping installation of k3s"
  fi
fi

if [[ "$SKIP_K3S" = "false" ]]; then
  if [[ `ps -aef|grep "docker serve"|grep -v grep|wc -l` -ne 0 ]]; then
    echo "Docker appears to be running and will cause issues with k3s"
    ps -aef|grep "docker serve"|grep -v grep
    exit 1
  fi
  if [[ -n "`activeFirewall`" ]]; then
    # k3s' pod (10.42.0.0/16) and service (10.43.0.0/16) networks must be allowed, or pods can't reach each other or the
    # API server (https://docs.k3s.io/installation/requirements#operating-system-specific-requirements).
    echo "Allowing the k3s pod and service networks in `activeFirewall`..."
    firewallTrustSource 10.42.0.0/16
    firewallTrustSource 10.43.0.0/16
  fi
  if [[ -x /usr/local/bin/k3s ]]; then
    echo "k3s is already installed."
    # Earlier versions of this script installed k3s with a world-readable kubeconfig (K3S_KUBECONFIG_MODE=644).
    if sudo test -f /etc/systemd/system/k3s.service.env && sudo grep -q '^K3S_KUBECONFIG_MODE=' /etc/systemd/system/k3s.service.env; then
      sudo sed -i '/^K3S_KUBECONFIG_MODE=/d' /etc/systemd/system/k3s.service.env
    fi
    sudo chmod 600 "$K3S_KUBECONFIG"
  else
    # Install k3s. Its kubeconfig (cluster-admin) stays root-only; the user gets a private copy below.
    echo "Installing k3s..."
    curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="$K3S_OPTIONS" sh -
    if [ $? -ne 0 ]; then
      echo "There was a problem installing k3s."
      exit 1
    fi
    recordInstalled k3s
  fi
  if [[ -z "$KUBECONFIG" || "$KUBECONFIG" = "$K3S_KUBECONFIG" ]]; then
    installKubeconfig
    export KUBECONFIG="$USER_KUBECONFIG"
  fi

  echo "Checking k3s has started..."
  result=`kubectl get nodes 2>/dev/null | grep ' Ready ' | wc -l`
  startTime=`date +%s`
  while [[ $result -eq 0 && $(( `date +%s` - startTime )) -lt 1800 ]]; do
    sleep 2
    echo "Waiting for k3s nodes to be ready..."
    result=`kubectl get nodes 2>/dev/null | grep ' Ready ' | wc -l`
  done
  if [ $result -eq 0 ]; then
    echo "There was a problem installing k3s..."
    exit 1
  else
    echo "k3s is running!"
  fi

  waitForDeployments kube-system kube-system
else
  # Under sudo, HOME is root's, so kubectl wouldn't find the installing user's kubeconfig by itself.
  if [[ -z "$KUBECONFIG" && -f "$USER_KUBECONFIG" ]]; then
    export KUBECONFIG="$USER_KUBECONFIG"
  fi
  if ! command -v kubectl >/dev/null 2>&1; then
    echo "kubectl isn't installed. Install it (and a kubeconfig for the cluster), or run without --skip-k3s."
    exit 1
  fi
  if ! kubectl get nodes >/dev/null 2>&1; then
    echo "kubectl can't reach a cluster. Set KUBECONFIG, or run without --skip-k3s."
    exit 1
  fi
fi

# Install Helm
run_step "Installing helm"
if command -v helm >/dev/null 2>&1; then
  echo "helm is already installed."
else
  if command -v snap >/dev/null 2>&1; then
    sudo snap install --classic helm
    HELM_INSTALLED_BY=snap
  else
    curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | sudo bash
    HELM_INSTALLED_BY=script
  fi
  if ! command -v helm >/dev/null 2>&1; then
    echo "There was a problem installing helm."
    exit 1
  fi
  recordInstalled helm "$HELM_INSTALLED_BY"
fi

# Install envoy gateway
run_step "Installing envoy-gateway"
if helm status eg -n "$ENVOY_NAMESPACE" >/dev/null 2>&1; then
  # Not upgraded here: helm doesn't upgrade CRDs, see https://gateway.envoyproxy.io/docs/install/install-helm/.
  echo "envoy-gateway is already installed."
elif helm install eg oci://docker.io/envoyproxy/gateway-helm --version "$ENVOY_GATEWAY_VERSION" \
    -n "$ENVOY_NAMESPACE" --create-namespace; then
  recordInstalled envoy_gateway
else
  echo "There was a problem installing envoy-gateway..."
  exit 1
fi
echo "Checking envoy-gateway has started..."
if ! kubectl wait --timeout=5m -n "$ENVOY_NAMESPACE" deployment/envoy-gateway --for=condition=Available; then
  echo "There was a problem installing envoy-gateway..."
  exit 1
fi
echo "envoy-gateway is running!"

# The Gateway's Envoy Service is a ClusterIP: only this host's nginx (below) forwards to it, using the PROXY protocol so
# Envoy puts each client's real address in X-Forwarded-For (the server's rate limits and audit log use it). A NodePort
# would expose Envoy on every interface, where anyone could send a PROXY header claiming any address.
if ! kubectl get gatewayclass envoy >/dev/null 2>&1; then
  ENVOY_GATEWAY_CLASS_NEW=true
fi
if ! kubectl apply -f - << EOF
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: bare-metal-proxy
  namespace: $ENVOY_NAMESPACE
spec:
  provider:
    type: Kubernetes
    kubernetes:
      envoyService:
        type: ClusterIP
---
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: envoy
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
  parametersRef:
    group: gateway.envoyproxy.io
    kind: EnvoyProxy
    name: bare-metal-proxy
    namespace: $ENVOY_NAMESPACE
EOF
then
  echo "There was a problem configuring the envoy GatewayClass..."
  exit 1
fi
if [[ "$ENVOY_GATEWAY_CLASS_NEW" = "true" ]]; then
  recordInstalled envoy_gateway_class
fi


if [[ "$TLS" = "true" ]]; then
  # Install cert-manager
  run_step "Installing cert-manager"

  if ! helm status cert-manager -n cert-manager >/dev/null 2>&1; then
    CERT_MANAGER_NEW=true
  fi
  helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager --namespace cert-manager --create-namespace \
        --set config.apiVersion="controller.config.cert-manager.io/v1alpha1" \
        --set config.kind="ControllerConfiguration" \
        --set config.enableGatewayAPI=true \
        --set crds.enabled=true
  waitForDeployments cert-manager cert-manager
  if [[ "$CERT_MANAGER_NEW" = "true" ]]; then
    recordInstalled cert_manager
  fi

  # The chart brings its own Issuer (and Certificate), registered with $ACME_EMAIL, so no ClusterIssuer is made here. Its
  # Issuer and Certificate are refused until cert-manager's webhook accepts requests, which can take a moment after its
  # Deployment is Available; a server-side dry run of an Issuer goes through the webhook without creating anything.
  startTime=`date +%s`
  until cat << EOF | kubectl apply --dry-run=server -f - >/dev/null 2>&1
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: webhook-check
  namespace: default
spec:
  selfSigned: {}
EOF
  do
    if [[ $(( `date +%s` - startTime )) -ge 300 ]]; then
      echo "There was a problem with cert-manager: its webhook isn't accepting requests."
      exit 1
    fi
    sleep 5
  done
fi

if [[ "$OPENBAO" = "true" ]]; then
  # Whatever the release already uses is kept, so neither a re-run nor the move into OpenBao invalidates the tokens,
  # cookies and sessions already out there.
  AUTH_SECRET=${AUTH_SECRET:-`existingSecret jwt-auth auth__secret`}
  AUTH_SECRET=${AUTH_SECRET:-`openssl rand -hex 32`}
  COOKIE_SECRET=`existingSecret service-secrets cookie_secret`
  COOKIE_SECRET=${COOKIE_SECRET:-`openssl rand -hex 32`}
  SESSION_SECRET=`existingSecret service-secrets session__secret`
  SESSION_SECRET=${SESSION_SECRET:-`openssl rand -hex 32`}

  if [[ "$OPENBAO_INSTALL" = "true" ]]; then
    run_step "Installing OpenBao"
    installOpenbao
    prepareOpenbao
  else
    echo "Keeping this release's secrets in the OpenBao at $OPENBAO_ADDRESS."
    echo "It must already hold them at $OPENBAO_KV_MOUNT/$OPENBAO_SECRETS_PATH, with the Secret $OPENBAO_ESO_SECRET in"
    echo "namespace $NAMESPACE holding a token that may read them - see README.md."
  fi

  # External Secrets is what copies the vault's values into the Kubernetes Secrets the pod reads (the chart's
  # externalSecrets values). Its CRDs are cluster-wide, so it can't come from the chart; installCRDs is the chart's own
  # default but is set here so an existing install without them is corrected.
  run_step "Installing external-secrets"
  addHelmRepo external-secrets https://charts.external-secrets.io
  helm repo update external-secrets >/dev/null
  if helm status external-secrets -n external-secrets >/dev/null 2>&1; then
    echo "external-secrets is already installed."
  elif helm install external-secrets external-secrets/external-secrets --version "$EXTERNAL_SECRETS_VERSION" \
      -n external-secrets --create-namespace --set installCRDs=true; then
    recordInstalled external_secrets
  else
    echo "There was a problem installing external-secrets."
    exit 1
  fi
  waitForDeployments external-secrets external-secrets
fi

run_step "Installing auth-server"
# A published chart carries its dependencies; a local checkout may need them fetched (Chart.yaml's "@bitnami" repos).
CHART_VERSION_ARGS=(--version "$VERSION")
if [[ -d "$CHART" ]]; then
  CHART_VERSION_ARGS=()
  if helm dependency list "$CHART" 2>/dev/null | grep -qw missing; then
    addHelmRepo bitnami https://charts.bitnami.com/bitnami
    if ! helm dependency build "$CHART"; then
      echo "There was a problem fetching the dependencies of $CHART."
      exit 1
    fi
  fi
fi

if ! helm status "$NAMESPACE" -n "$NAMESPACE" >/dev/null 2>&1; then
  RELEASE_NEW=true
fi
# Where the release's secrets come from: the vault, or the Kubernetes Secrets the chart renders itself (generated on
# the first install and kept on upgrades either way, so none are passed here).
OPENBAO_ARGS=(--set global.openbao.enabled=false)
if [[ "$OPENBAO" = "true" ]]; then
  OPENBAO_ARGS=(--set global.openbao.enabled=true
    --set global.openbao.address="$OPENBAO_ADDRESS"
    --set global.openbao.kvMount="$OPENBAO_KV_MOUNT"
    --set global.openbao.secretsPath="$OPENBAO_SECRETS_PATH"
    --set global.openbao.auth.method=token
    --set global.openbao.auth.tokenSecret="$OPENBAO_ESO_SECRET")
fi
# The chart creates its own Gateway ($GATEWAY_NAME in this namespace) on the envoy GatewayClass above, with an HTTPS
# listener and a cert-manager Certificate (from its own Issuer, registered with $ACME_EMAIL) whenever global.gateway.tls is
# on and the host can get one. global.gateway.hsts stays true: browsers ignore HSTS over plain HTTP anyway.
GATEWAY_TLS=false
if [[ "$TLS" = "true" && "$AUTH_HOST" != "localhost" && "$AUTH_HOST" != *.local* ]]; then
  GATEWAY_TLS=true
fi
if ! helm upgrade --install --create-namespace --namespace "$NAMESPACE" "$NAMESPACE" "$CHART" "${CHART_VERSION_ARGS[@]}" \
  "${OPENBAO_ARGS[@]}" \
  --set host="$AUTH_HOST" --set global.gateway.tls="$TLS" --set global.gateway.hsts=true --set global.gateway.className=envoy \
  --set global.certmanager.email="$ACME_EMAIL"; then
  echo "There was a problem installing auth-server."
  exit 1
fi
if [[ "$RELEASE_NEW" = "true" ]]; then
  recordInstalled release "$NAMESPACE"
fi

# Wait for envoy-gateway to provision the Service for the Gateway the chart created.
echo "Waiting for $GATEWAY_NAME's Envoy Service..."
GATEWAY_IP=""
startTime=`date +%s`
while [[ $(( `date +%s` - startTime )) -lt 300 ]]; do
  GATEWAY_IP=`gatewayService .spec.clusterIP`
  GATEWAY_TYPE=`gatewayService .spec.type`
  # Not port 443: Envoy leaves the HTTPS listener out until its certificate exists, and cert-manager issues that through
  # this very Service once nginx forwards to it.
  if [[ -n "$GATEWAY_IP" && "$GATEWAY_TYPE" = "ClusterIP" && -n "`gatewayService '.spec.ports[?(@.port==80)].port'`" ]]; then
    break
  fi
  GATEWAY_IP=""
  sleep 2
done
if [[ -z "$GATEWAY_IP" ]]; then
  echo "There was a problem setting up $GATEWAY_NAME: its Envoy Service isn't a ClusterIP Service with port 80."
  echo "  kubectl -n $GATEWAY_NAMESPACE get gateway"
  echo "  kubectl -n $ENVOY_NAMESPACE get svc -l gateway.envoyproxy.io/owning-gateway-name=$GATEWAY_NAME"
  exit 1
fi
GATEWAY_ADDRESS=$GATEWAY_IP
if [[ "$GATEWAY_IP" = *:* ]]; then
  GATEWAY_ADDRESS="[$GATEWAY_IP]"
fi

# Every connection to the Gateway comes from nginx, which sends the PROXY protocol header; others are refused, so the
# address Envoy reports (and the auth-server rate limits and audit-logs) can't be forged.
if ! kubectl apply -f - << EOF
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: $GATEWAY_NAME-proxy-protocol
  namespace: $GATEWAY_NAMESPACE
spec:
  targetRefs:
  - group: gateway.networking.k8s.io
    kind: Gateway
    name: $GATEWAY_NAME
  proxyProtocol: {}
EOF
then
  echo "There was a problem configuring the PROXY protocol policy..."
  exit 1
fi
recordInstalled proxy_protocol_policy

# Set up nginx reverse proxy
run_step "Installing nginx reverse proxy"
if [[ -e /etc/redhat-release ]]; then
  # RHEL/Fedora package the stream module as nginx-mod-stream (libnginx-mod-stream is Debian's name).
  if ! rpm -q nginx >/dev/null 2>&1; then
    echo "Installing nginx for reverse proxy..."
    if ! sudo dnf install nginx nginx-mod-stream -y; then
      echo "There was a problem installing nginx reverse proxy."
      exit 1
    fi
    recordInstalled nginx dnf
  elif ! rpm -q nginx-mod-stream >/dev/null 2>&1; then
    # An nginx built with the stream module (e.g. nginx.org's packages) has no such package; `nginx -t` below tells.
    echo "Installing the nginx stream module..."
    sudo dnf install nginx-mod-stream -y
  fi
else
  if [[ `dpkg-query -W -f='${Status}' nginx 2>/dev/null` != "install ok installed" ]]; then
    echo "Installing nginx for reverse proxy..."
    if ! sudo apt-get install nginx libnginx-mod-stream -y; then
      echo "There was a problem installing nginx reverse proxy."
      exit 1
    fi
    recordInstalled nginx apt
  elif [[ `dpkg-query -W -f='${Status}' libnginx-mod-stream 2>/dev/null` != "install ok installed" ]]; then
    echo "Installing the nginx stream module..."
    sudo apt-get install libnginx-mod-stream -y
  fi
fi

if [[ -n "`activeFirewall`" ]]; then
  echo "Opening HTTP and HTTPS in `activeFirewall`..."
  firewallOpenPort 80/tcp
  if [[ "$TLS" = "true" ]]; then
    firewallOpenPort 443/tcp
  fi
fi
# SELinux (RHEL/Fedora) only lets nginx connect to other hosts' HTTP ports (the Gateway's ports 80 and 443) with this
# boolean. Debian's AppArmor has no nginx profile by default, so there's nothing to do there.
if command -v getenforce >/dev/null 2>&1 && [[ `getenforce` = "Enforcing" ]] \
    && [[ `getsebool httpd_can_network_relay 2>/dev/null` = *off ]]; then
  echo "Allowing nginx to relay connections (SELinux httpd_can_network_relay)..."
  if sudo setsebool -P httpd_can_network_relay 1; then
    recordInstalled selinux_nginx_relay
  fi
fi

# Check if we've already written to this file before
if ! sudo grep -qxF "$NGINX_BEGIN" "$NGINX_CONF" && sudo grep -Eq '^[[:space:]]*stream[[:space:]]*\{' "$NGINX_CONF"; then
  # Written by an earlier version of this script (without markers) or by hand: don't add a second stream block.
  echo "$NGINX_CONF already has a stream {} block this script didn't write; make sure it forwards port 80 to" \
    "$GATEWAY_ADDRESS:80${GATEWAY_TLS:+ and port 443 to $GATEWAY_ADDRESS:443} with proxy_protocol on, then re-run."
else
  if [[ ! -f "$NGINX_CONF.bak" ]]; then
    echo "Backing up nginx.conf..."
    sudo cp "$NGINX_CONF" "$NGINX_CONF.bak"
  fi
  echo "Writing nginx configuration..."
  # The stream proxy takes port 80 (and 443) for the Gateway, so no http server may listen there.
  disablePort80HttpServers
  # A host name with an AAAA record is tried over IPv6 first, by browsers and by Let's Encrypt alike, so listen there too
  # when the host has IPv6.
  LISTEN6_80=""
  LISTEN6_443=""
  if [[ -e /proc/net/if_inet6 && "`cat /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null`" != "1" ]]; then
    LISTEN6_80="
        listen [::]:80;"
    LISTEN6_443="
        listen [::]:443;"
  fi
  # Port 443 is only forwarded when the chart's Gateway has an HTTPS listener (global.gateway.tls and a public host).
  HTTPS_SERVER=""
  if [[ "$GATEWAY_TLS" = "true" ]]; then
    HTTPS_SERVER="
    server {
        listen 443;$LISTEN6_443
        proxy_pass $GATEWAY_ADDRESS:443;
        proxy_protocol on;
    }"
  fi
  # Replace the block from an earlier run (the Gateway's Service address may have changed).
  sudo sed -i "/^$NGINX_BEGIN\$/,/^$NGINX_END\$/d" "$NGINX_CONF"
  sudo tee -a "$NGINX_CONF" > /dev/null << EOF
$NGINX_BEGIN
stream {
    server {
        listen 80;$LISTEN6_80
        proxy_pass $GATEWAY_ADDRESS:80;
        proxy_protocol on;
    }$HTTPS_SERVER
}
$NGINX_END
EOF
fi

if sudo test -e /etc/nginx/sites-enabled/default; then
  # Debian's default site listens on port 80. Kept aside so --uninstall can put it back.
  sudo install -d -m 0755 "$STATE_DIR"
  sudo mv /etc/nginx/sites-enabled/default "$STATE_DIR/sites-enabled-default"
  recordInstalled nginx_default_site moved
fi

if ! sudo nginx -t; then
  echo "The nginx configuration is invalid (see above). Fix $NGINX_CONF and re-run."
  exit 1
fi
if ! sudo systemctl enable nginx >/dev/null 2>&1 || ! sudo systemctl restart nginx; then
  echo "There was a problem restarting nginx reverse proxy. Whatever listens on port 80 or 443 now (another web server,"
  echo "or a server block in /etc/nginx/conf.d/ or /etc/nginx/sites-enabled/ listening there) must be stopped or moved:"
  sudo ss -ltnp '( sport = :80 or sport = :443 )'
  exit 1
fi
echo "Checking the reverse proxy reaches $GATEWAY_NAME..."
result=000
startTime=`date +%s`
while [[ $(( `date +%s` - startTime )) -lt 300 ]]; do
  # Any HTTP answer but 400 (a 404 before the chart's routes exist) means nginx reaches Envoy and Envoy accepts its PROXY
  # header. Envoy answers 400 when the header is sent and it isn't expecting one, or the other way round.
  result=`curl -s -o /dev/null -w "%{http_code}" http://localhost`
  if [[ "$result" != "000" && "$result" != "400" ]]; then
    break
  fi
  echo "Waiting for the reverse proxy..."
  sleep 2
done
if [[ "$result" = "000" || "$result" = "400" ]]; then
  if [[ "$result" = "400" ]]; then
    echo "There was a problem configuring nginx reverse proxy: Envoy answers http://localhost with 400, so it doesn't accept"
    echo "the PROXY protocol header nginx sends. Check the ClientTrafficPolicy with"
    echo "  kubectl -n $GATEWAY_NAMESPACE get clienttrafficpolicy"
  else
    echo "There was a problem configuring nginx reverse proxy: http://localhost doesn't answer."
  fi
  echo "Check the Envoy pods with"
  echo "  kubectl -n $ENVOY_NAMESPACE get pods -l gateway.envoyproxy.io/owning-gateway-name=$GATEWAY_NAME"
  exit 1
fi
echo "Reverse proxy is setup."

# Stop background loop
running=false
if [[ -n "$progress_pid" ]]; then
  wait "$progress_pid"
fi

# The chart's resource prefix (its "rrst.fullname"): the release name, suffixed with the chart name "auth-server"
# unless the release name already contains it.
FULLNAME=$NAMESPACE
if [[ "$NAMESPACE" != *auth-server* ]]; then
  FULLNAME="$NAMESPACE-auth-server"
fi
SCHEME=http
if [[ "$TLS" = "true" ]]; then
  SCHEME=https
fi
echo "Installation complete."
echo "The auth-server is at $SCHEME://$AUTH_HOST."
echo "Its JWT secret is generated once and kept across upgrades. Every service that verifies these tokens needs the same"
echo "secret, audience and issuer:"
echo "  kubectl -n $NAMESPACE get secret $FULLNAME-jwt-auth -o jsonpath='{.data.auth__secret}' | base64 -d"

if [[ $AUTH_HOST =~ \.local(host)?$ || $AUTH_HOST = "localhost" ]]; then
  echo "Please update the hosts file to resolve the following:"
  echo -e "\t $AUTH_HOST"
fi
