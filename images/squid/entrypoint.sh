#!/bin/bash
set -euo pipefail

# Start dnsmasq in the background if config exists
if [ -f /etc/yologuard/dns/dnsmasq.conf ]; then
    echo "Starting controlled DNS resolver..."
    dnsmasq --conf-file=/etc/yologuard/dns/dnsmasq.conf --keep-in-foreground &
    DNS_PID=$!
fi

# Start Squid with YoloGuard config
if [ -f /etc/yologuard/squid/squid.conf ]; then
    echo "Starting Squid with YoloGuard config..."
    cp /etc/yologuard/squid/squid.conf /etc/squid/squid.conf
fi

echo "Starting Squid proxy..."
exec squid -N -f /etc/squid/squid.conf
