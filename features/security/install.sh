#!/usr/bin/env bash
# YoloGuard Security Layer — DevContainer Feature install script
set -euo pipefail

GATEWAY_SOCKET="${GATEWAYSOCKETPATH:-/yologuard/gateway.sock}"

# -------------------------------------------------------------------
# Dependencies
# -------------------------------------------------------------------
echo "Installing dependencies..."
apt-get update && apt-get install -y socat && rm -rf /var/lib/apt/lists/*

# -------------------------------------------------------------------
# Credential helper
# -------------------------------------------------------------------
if [ "${INSTALLCREDENTIALHELPER:-true}" = "true" ]; then
    echo "Installing YoloGuard git credential helper..."

    mkdir -p /usr/local/bin
    cat > /usr/local/bin/git-credential-yologuard <<'CRED_EOF'
#!/usr/bin/env bash
# YoloGuard git credential helper — forwards credential requests to gateway via unix socket
set -euo pipefail

SOCKET="${GATEWAY_SOCKET:-/yologuard/gateway.sock}"
SANDBOX_ID="${YOLOGUARD_SANDBOX_ID:-}"

# Git credential helper protocol: only handle "get" operation
ACTION="${1:-}"
if [ "$ACTION" != "get" ]; then
    exit 0
fi

# Read key=value pairs from stdin
declare -A FIELDS
while IFS='=' read -r key value; do
    [ -z "$key" ] && break
    FIELDS["$key"]="$value"
done

PROTOCOL="${FIELDS[protocol]:-}"
HOST="${FIELDS[host]:-}"
REQPATH="${FIELDS[path]:-}"

if [ -z "$PROTOCOL" ] || [ -z "$HOST" ]; then
    echo "git-credential-yologuard: missing protocol or host" >&2
    exit 1
fi

# Build JSON request
REQUEST=$(printf '{"type":"credential.get","sandboxId":"%s","payload":{"protocol":"%s","host":"%s","path":"%s"}}\n' \
    "$SANDBOX_ID" "$PROTOCOL" "$HOST" "$REQPATH")

# Send to gateway socket and read response
RESPONSE=$(echo "$REQUEST" | socat - UNIX-CONNECT:"$SOCKET" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    echo "git-credential-yologuard: no response from gateway" >&2
    exit 1
fi

# Parse response — extract username and password
SUCCESS=$(echo "$RESPONSE" | sed -n 's/.*"success":\s*\(true\|false\).*/\1/p')

if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$RESPONSE" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')
    echo "git-credential-yologuard: denied — $ERROR" >&2
    exit 1
fi

USERNAME=$(echo "$RESPONSE" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
PASSWORD=$(echo "$RESPONSE" | sed -n 's/.*"password":"\([^"]*\)".*/\1/p')

echo "username=$USERNAME"
echo "password=$PASSWORD"
CRED_EOF
    chmod +x /usr/local/bin/git-credential-yologuard

    # Configure git to use the credential helper system-wide
    git config --system credential.helper yologuard
fi

# -------------------------------------------------------------------
# Request tool
# -------------------------------------------------------------------
if [ "${INSTALLREQUESTTOOL:-true}" = "true" ]; then
    echo "Installing yologuard-request tool..."

    mkdir -p /usr/local/bin
    cat > /usr/local/bin/yologuard-request <<'REQ_EOF'
#!/usr/bin/env bash
# YoloGuard request tool — sends permission requests to gateway via unix socket
# Usage: yologuard-request <type> <json-payload> [reason]
# Types: egress.allow, repo.add, secret.use, git.push, pr.create
# Blocks until approved or denied. Exit 0 = approved, exit 1 = denied.
set -euo pipefail

SOCKET="${GATEWAY_SOCKET:-/yologuard/gateway.sock}"
SANDBOX_ID="${YOLOGUARD_SANDBOX_ID:-}"

REQUEST_TYPE="${1:-}"
PAYLOAD="${2:-{}}"
REASON="${3:-}"

if [ -z "$REQUEST_TYPE" ]; then
    echo "Usage: yologuard-request <type> <json-payload> [reason]" >&2
    echo "Types: egress.allow, repo.add, secret.use, git.push, pr.create" >&2
    exit 2
fi

# Validate type
case "$REQUEST_TYPE" in
    egress.allow|repo.add|secret.use|git.push|pr.create) ;;
    *)
        echo "yologuard-request: unknown type '$REQUEST_TYPE'" >&2
        echo "Valid types: egress.allow, repo.add, secret.use, git.push, pr.create" >&2
        exit 2
        ;;
esac

if [ -z "$SANDBOX_ID" ]; then
    echo "yologuard-request: YOLOGUARD_SANDBOX_ID not set" >&2
    exit 2
fi

# Build JSON request
if [ -n "$REASON" ]; then
    REQUEST=$(printf '{"type":"%s","sandboxId":"%s","payload":%s,"reason":"%s"}\n' \
        "$REQUEST_TYPE" "$SANDBOX_ID" "$PAYLOAD" "$REASON")
else
    REQUEST=$(printf '{"type":"%s","sandboxId":"%s","payload":%s}\n' \
        "$REQUEST_TYPE" "$SANDBOX_ID" "$PAYLOAD")
fi

echo "yologuard: requesting permission for $REQUEST_TYPE..." >&2

# Send to gateway socket and block until response
# socat will keep the connection open until the server sends a response + closes
RESPONSE=$(echo "$REQUEST" | socat -t 3600 - UNIX-CONNECT:"$SOCKET" 2>/dev/null)

if [ -z "$RESPONSE" ]; then
    echo "yologuard-request: no response from gateway (socket: $SOCKET)" >&2
    exit 1
fi

# Parse the approved field from JSON response
APPROVED=$(echo "$RESPONSE" | sed -n 's/.*"approved":\s*\(true\|false\).*/\1/p')
SUCCESS=$(echo "$RESPONSE" | sed -n 's/.*"success":\s*\(true\|false\).*/\1/p')

if [ "$SUCCESS" != "true" ]; then
    ERROR=$(echo "$RESPONSE" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')
    echo "yologuard-request: error — $ERROR" >&2
    exit 1
fi

if [ "$APPROVED" = "true" ]; then
    echo "yologuard: $REQUEST_TYPE approved" >&2
    exit 0
else
    DENY_REASON=$(echo "$RESPONSE" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p')
    echo "yologuard: $REQUEST_TYPE denied${DENY_REASON:+ — $DENY_REASON}" >&2
    exit 1
fi
REQ_EOF
    chmod +x /usr/local/bin/yologuard-request
fi

# -------------------------------------------------------------------
# Proxy configuration
# -------------------------------------------------------------------
if [ "${CONFIGUREPROXY:-true}" = "true" ]; then
    echo "Configuring HTTP/HTTPS proxy..."

    # Proxy env vars will be set by the Squid sidecar's address.
    # The actual address is injected at container start via containerEnv;
    # this section writes the profile.d script so every shell inherits them.
    cat > /etc/profile.d/yologuard-proxy.sh <<'PROXY_EOF'
# YoloGuard egress proxy — values injected at container start
export HTTP_PROXY="${YOLOGUARD_PROXY_URL:-}"
export HTTPS_PROXY="${YOLOGUARD_PROXY_URL:-}"
export NO_PROXY="localhost,127.0.0.1,${GATEWAY_SOCKET:-/yologuard/gateway.sock}"
PROXY_EOF
    chmod +r /etc/profile.d/yologuard-proxy.sh
fi

# -------------------------------------------------------------------
# DNS configuration
# -------------------------------------------------------------------
if [ "${CONFIGUREDNS:-true}" = "true" ]; then
    echo "Configuring controlled DNS resolver..."

    # TODO: Point to the YoloGuard-controlled DNS resolver
    # The resolver address is injected at container start.
    # For now, leave /etc/resolv.conf untouched so the container
    # works during development without a resolver sidecar.
    echo "DNS override: skipped (resolver address not yet available)"
fi

# -------------------------------------------------------------------
# Pre-push hook
# -------------------------------------------------------------------
if [ "${INSTALLPREPUSHHOOK:-true}" = "true" ]; then
    echo "Installing git pre-push hook template..."

    mkdir -p /etc/yologuard/hooks
    cat > /etc/yologuard/hooks/pre-push <<'HOOK_EOF'
#!/usr/bin/env bash
# YoloGuard pre-push hook — defense-in-depth
# Blocks direct pushes; all pushes must go through the gateway.
echo "yologuard: direct git push is not allowed inside the sandbox." >&2
echo "yologuard: use 'yologuard-request push' to request a push via the gateway." >&2
exit 1
HOOK_EOF
    chmod +x /etc/yologuard/hooks/pre-push

    # Configure git to use the hook template directory
    git config --system core.hooksPath /etc/yologuard/hooks
fi

# -------------------------------------------------------------------
# Tmux configuration
# -------------------------------------------------------------------
echo "Configuring tmux..."
mkdir -p /etc/yologuard
cat > /etc/yologuard/tmux.conf <<'TMUX_EOF'
# YoloGuard tmux config — keeps sandbox sessions organised
set -g default-terminal "screen-256color"
set -g history-limit 10000
set -g status-right "YoloGuard sandbox"
TMUX_EOF

echo "YoloGuard security layer installation complete."
