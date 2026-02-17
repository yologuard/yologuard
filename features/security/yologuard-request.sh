#!/usr/bin/env bash
# yologuard-request — send permission requests to gateway
set -euo pipefail

TYPE="${1:?Usage: yologuard-request <type> <json-payload>}"
PAYLOAD="${2:-{}}"
SOCKET="${YOLOGUARD_SOCKET:-/yologuard/gateway.sock}"

# Send request and wait for response
echo "{\"type\":\"$TYPE\",\"sandboxId\":\"$YOLOGUARD_SANDBOX_ID\",\"payload\":$PAYLOAD}" \
	| socat - UNIX-CONNECT:"$SOCKET"
