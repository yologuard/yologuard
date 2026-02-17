# 🛡️ YoloGuard

[![MIT License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/yologuard/yologuard)
[![npm version](https://img.shields.io/npm/v/yologuard.svg)](https://npmjs.org/yologuard)
[![npm downloads](https://img.shields.io/npm/dw/yologuard.svg)](https://npmjs.org/yologuard)
[![GitHub stars](https://img.shields.io/github/stars/yologuard/yologuard)](https://github.com/yologuard/yologuard)

> Full-team guardrails for AI coding agents. Lives in Slack.

**Status:** Pre-alpha

YoloGuard runs AI coding agents (Claude Code, Codex, Gemini CLI) in default-deny Docker sandboxes with host-enforced network isolation, an approval system, and a full audit trail. Agents request permissions at runtime; humans approve by category.

## Quick Start

```bash
pnpm install && pnpm build

# First-time setup
pnpm yologuard setup
pnpm yologuard doctor

# Start gateway + launch a sandbox
pnpm yologuard start
pnpm yologuard launch --agent claude .
```

## CLI Reference

```
Usage: yologuard <command> [options]

Gateway:
  gateway start          Start the gateway server
  gateway stop           Stop the gateway server
  start                  Alias for gateway start

Setup & Config:
  setup                  Interactive guided setup
  config get <key>       Get a config value
  config set <k> <v>     Set a config value
  config unset <key>     Remove a config value
  doctor                 Validate environment (Docker, config, Node.js)

Sandbox Lifecycle:
  launch [path]          Create a sandbox and launch an agent
  list                   List active sandboxes
  attach <sandbox>       Attach to agent's tmux session
  logs <sandbox>         Show sandbox container logs
  stop <sandbox-id>      Stop and destroy a sandbox
  warm                   Pre-fetch repos into local cache

Approvals:
  approvals <id>         List pending approvals for a sandbox
  approve <id> <req>     Approve or deny a pending request
  revoke <id> <appr>     Revoke a previously granted approval

Egress:
  egress <sandbox>       Show egress config (preset + allowlist)
  egress add <id> <dom>  Add domains to allowlist
  egress remove <id> <d> Remove domains from allowlist
  egress set <id> ...    Replace allowlist or switch preset

Audit:
  audit <sandbox>        Show audit log for a sandbox
```

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│   CLI / TUI  │────▶│  Gateway (Fastify + openapi-backend)     │
└─────────────┘     │  ├── Sandbox store (JSON file)            │
                    │  ├── Approval router (socket IPC)         │
                    │  ├── Token store (PATs, scoped creds)     │
                    │  └── Docker client (dockerode)            │
                    └──────┬──────────────────┬────────────────┘
                           │                  │
              ┌────────────▼──┐    ┌──────────▼──────────┐
              │  DevContainer  │    │  Squid Sidecar       │
              │  (sandbox)     │◀──▶│  (egress filtering)  │
              │  ├── Agent     │    │  ├── Domain allowlist │
              │  ├── tmux      │    │  └── Bridge network   │
              │  └── cred help │    └───────────────────────┘
              └────────────────┘
                isolated network (no bridge access)
```

- **Sandboxes** are DevContainers on an isolated Docker network with no direct internet
- **Squid sidecar** per sandbox proxies only allowlisted domains
- **Credential helper** in the container talks to the gateway over a unix socket -- real tokens never enter the sandbox
- **Approval system** lets agents request permissions (`egress.allow`, `git.push`, `pr.create`) and blocks until a human approves

## Development

```bash
pnpm install
pnpm build
pnpm test          # 345 unit tests (no Docker needed)
pnpm test:e2e      # E2E tests (requires Docker)
```

## Monorepo Structure

```
packages/
  shared/        Shared types, config schema, constants
  gateway/       Control plane (Fastify + openapi-backend + Docker)
  sandbox/       Sandbox manager (wraps @devcontainers/cli)
  egress/        Squid sidecar config, DNS, allowlist presets
  credentials/   Git credential helper + token store
  audit/         Audit logger (SQLite via better-sqlite3)
  cli/           CLI entry point
  pr-client/     GitHub REST client for PR creation
  indexer/       Codebase indexer (tree-sitter) [not started]
```

## Configuration

Config lives at `~/.yologuard/yologuard.json` (JSON5 supported).

```json5
{
  gateway: { host: "127.0.0.1", port: 4200 },
  sandbox: { agent: "claude", networkPolicy: "node-web", idleTimeoutMs: 1800000 },
  egressAllowlist: ["custom-registry.internal"],
  egressBlocklist: ["pastebin.com"],
  workspaces: {
    "my-project": {
      repos: [{ url: "github.com/org/repo", access: "read-write" }]
    }
  }
}
```

## License

MIT
