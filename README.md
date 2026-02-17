# 🛡️ YoloGuard

[![MIT License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/yologuard/yologuard)
[![npm version](https://img.shields.io/npm/v/yologuard.svg)](https://npmjs.org/yologuard)
[![npm downloads](https://img.shields.io/npm/dw/yologuard.svg)](https://npmjs.org/yologuard)

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

## Philosophy: Shoulders of Giants

**Build as little custom as possible.** Every component is an existing, proven, boring open-source tool — YoloGuard just wires them together with good UX and agent-specific policy.

| Layer | Boring tech we use | What we build |
|-------|-------------------|---------------|
| Sandboxing | **Docker** + **Dev Containers** (`@devcontainers/cli`) | Config merging, lifecycle orchestration |
| Network isolation | **Docker** `--network=none` + **Squid** sidecar | Sidecar lifecycle, DNS resolver, allowlist management |
| Git credentials | **git credential helper** protocol (built-in to git) | Gateway-side token management, branch allowlist |
| PR creation | **GitHub/GitLab REST API** | Minimal gateway REST client (~3 endpoints) |
| Codebase indexing | **tree-sitter** (multi-language AST parser) | Structural compressor, symbol extractor |
| Audit storage | **SQLite** | Scoped query engine, redaction |
| Config | **JSON5** | Dot-path CLI (`config get/set/unset`) |

YoloGuard's custom code is almost entirely **policy and UX** — the plumbing is proven infrastructure that security teams already know and trust.

## How It Works

```
┌──────────────────────────────────────┐
│         Standard Dev Container       │
│  (devcontainer.json / Dockerfile)    │
│  (--network=none, host-enforced)     │
│                                      │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Workspace  │  │  Dev Features  │  │
│  │ (repo)     │  │  (Node, Py..)  │  │
│  └────────────┘  └────────────────┘  │
│  ┌────────────┐  ┌────────────────┐  │
│  │ VS Code    │  │  Agent CLI     │  │
│  │ Server     │  │  (Claude etc)  │  │
│  └────────────┘  └────────────────┘  │
├──────────────────────────────────────┤
│    YoloGuard layers (in container)   │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Git cred   │  │  yologuard-    │  │
│  │ helper     │  │  request tool  │  │
│  │ → gateway  │  │  → gateway     │  │
│  └────────────┘  └────────────────┘  │
│  ┌────────────┐  ┌────────────────┐  │
│  │ HTTP_PROXY │  │  Audit hooks   │  │
│  │ → sidecar  │  │               │  │
│  └────────────┘  └────────────────┘  │
├──────────────────────────────────────┤
│    Gateway-side (host)               │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Squid      │  │  Credential    │  │
│  │ sidecar    │  │  token store   │  │
│  └────────────┘  └────────────────┘  │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Approval   │  │  PR creation   │  │
│  │ router     │  │  REST client   │  │
│  └────────────┘  └────────────────┘  │
└──────────────────────────────────────┘
```

1. **`yologuard launch --agent claude .`** — reads config, merges with `.devcontainer/devcontainer.json` (or generates one)
2. **Builds the Dev Container** via `@devcontainers/cli`, injecting security layers as a DevContainer Feature
3. **Creates isolated network** — `--network=none` with a Squid sidecar for allowlisted egress
4. **Launches agent** inside tmux — works with any terminal-based agent, no agent modification needed
5. **Agent requests permissions** via `yologuard-request` over unix socket — blocks until approved
6. **Human approves** via CLI — by category (egress, push, PR), not per-command

### Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Security model | Default-deny + approval requests | Agents start with zero permissions. Approve by class, not command. Kills approval fatigue. |
| Sandbox standard | **Dev Containers** (containers.dev) | Open standard. Existing `devcontainer.json` works out of the box. VS Code connects natively. |
| Network isolation | `--network=none` + Squid sidecar | Host-enforced, not bypassable from inside the container. |
| Git credentials | Custom credential helper + gateway | Real tokens never enter the container. Scoped, short-lived creds. Branch allowlist at auth layer. |
| PR creation | Minimal REST client on gateway | 3 API calls instead of proxying the entire `gh`/`glab` CLI surface. Predictable and testable. |
| Agent interface | tmux inside container | Works with any terminal-based agent. No agent modification needed. |
| Orchestration | Docker only (no K8s) | `docker` is already installed everywhere. K8s is overkill for local dev. |

### The Big Idea: Dev Containers + Security Layers

**A YoloGuard sandbox is a [Dev Container](https://containers.dev/) with security layers bolted on.**

- Repos with `.devcontainer/devcontainer.json` work immediately
- VS Code connects natively — same experience as GitHub Codespaces
- The entire DevContainer ecosystem of [Features](https://containers.dev/features) and [Templates](https://containers.dev/templates) is available
- YoloGuard doesn't reinvent container building — it uses `@devcontainers/cli` under the hood

**What YoloGuard adds on top:**

- Host-enforced network isolation (`--network=none` + Squid sidecar)
- Git credential helper (gateway-side tokens, branch allowlist)
- PR creation via gateway REST client (agent never has direct GitHub API access)
- Approval system (`yologuard-request` — approve by class, not command)
- Audit logging (approvals, git ops, network destinations)
- Agent lifecycle management (launch, monitor, idle timeout, stop)

### Git Integration

**Cloning happens on the host, not inside the sandbox.** Repos are cached as bare clones at `~/.yologuard/repos/` and mounted as git worktrees. The agent never runs `git clone` against a remote.

Inside the sandbox, the real `git` binary stays — a custom **credential helper** handles auth by talking to the gateway over a unix socket. The gateway holds real tokens and issues scoped, short-lived credentials per request.

| Operation | Behavior |
|-----------|----------|
| `git commit`, `checkout`, `branch` | Unrestricted — local, no network needed |
| `git pull`, `git fetch` | Works for approved remotes via credential helper |
| `git push` (approved branch) | Works — credential helper provides scoped creds |
| `git push` (unapproved branch) | Blocked at credential layer + pre-push hook |
| PR creation | Via `yologuard-request pr.create` — gateway REST client, not `gh`/`glab` |

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
