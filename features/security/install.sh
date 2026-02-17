#!/usr/bin/env bash
# YoloGuard Security Layer — DevContainer Feature install script
set -euo pipefail

GATEWAY_SOCKET="${GATEWAYSOCKETPATH:-/yologuard/gateway.sock}"

# -------------------------------------------------------------------
# Credential helper
# -------------------------------------------------------------------
if [ "${INSTALLCREDENTIALHELPER:-true}" = "true" ]; then
    echo "Installing YoloGuard git credential helper..."

    # TODO: Copy pre-built credential helper binary into container
    # For now, create a placeholder script
    mkdir -p /usr/local/bin
    cat > /usr/local/bin/git-credential-yologuard <<'CRED_EOF'
#!/usr/bin/env bash
# Placeholder: forwards credential requests to gateway via unix socket
echo "git-credential-yologuard: not yet implemented" >&2
exit 1
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

    # TODO: Copy pre-built request tool binary into container
    mkdir -p /usr/local/bin
    cat > /usr/local/bin/yologuard-request <<'REQ_EOF'
#!/usr/bin/env bash
# Placeholder: sends permission requests to gateway via unix socket
echo "yologuard-request: not yet implemented" >&2
exit 1
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
