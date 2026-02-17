# Squid sidecar for YoloGuard egress filtering
FROM ubuntu/squid:latest

# Install dnsmasq for controlled DNS resolution
RUN apt-get update && apt-get install -y --no-install-recommends \
    dnsmasq \
    && rm -rf /var/lib/apt/lists/*

# Create config directories
RUN mkdir -p /etc/yologuard/squid /etc/yologuard/dns

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3128
EXPOSE 53/udp

ENTRYPOINT ["/entrypoint.sh"]
