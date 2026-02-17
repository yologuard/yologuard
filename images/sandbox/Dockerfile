# Base sandbox image for YoloGuard
FROM debian:bookworm-slim

# Install essential tools in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    vim \
    curl \
    tmux \
    build-essential \
    ca-certificates \
    gnupg \
    procps \
    less \
    vim-tiny \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root yologuard user
RUN groupadd -g 1000 yologuard \
    && useradd -m -u 1000 -g 1000 -s /bin/bash yologuard

# Create workspace directory
RUN mkdir -p /workspace && chown yologuard:yologuard /workspace

# Create yologuard runtime directory (for gateway socket, config, etc.)
RUN mkdir -p /yologuard && chown yologuard:yologuard /yologuard

USER yologuard
WORKDIR /workspace

CMD ["bash"]
