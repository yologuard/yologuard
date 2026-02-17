# YoloGuard

[![MIT License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/yologuard/yologuard)
[![npm version](https://img.shields.io/npm/v/yologuard.svg)](https://npmjs.org/yologuard)
[![npm downloads](https://img.shields.io/npm/dw/yologuard.svg)](https://npmjs.org/yologuard)
[![GitHub stars](https://img.shields.io/github/stars/yologuard/yologuard)](https://github.com/yologuard/yologuard)

Default-deny Docker sandbox for AI coding agents. Guardrails that let agents code fast without giving away the keys.

**Status:** Pre-alpha (v0.0.1)

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the CLI
pnpm yologuard --help

# Run tests
pnpm test
```

## Try the CLI

```bash
# Show version
pnpm yologuard --version

# Check environment (Docker, Node.js, config)
pnpm yologuard doctor

# Start the gateway server
pnpm yologuard start

# Create a sandbox and launch an agent
pnpm yologuard launch --agent claude /path/to/repo
```

## Architecture

```
packages/
├── cli/          # CLI entry point (yologuard command)
├── gateway/      # Control plane (Fastify + OpenAPI + WebSocket)
├── sandbox/      # Sandbox lifecycle (wraps @devcontainers/cli)
├── credentials/  # Git credential helper + token store
├── pr-client/    # GitHub REST client for PR creation
├── egress/       # Network isolation (Squid sidecar + DNS)
├── audit/        # Audit logger (SQLite)
├── indexer/      # Codebase indexer (placeholder)
└── shared/       # Shared types, config, constants
images/
├── sandbox/      # Base sandbox Dockerfile
└── squid/        # Squid proxy sidecar image
features/
└── security/     # DevContainer Feature for security layers
```

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Watch tests
pnpm test:watch

# Lint
pnpm lint

# Fix lint
pnpm lint:fix
```

## License

MIT
