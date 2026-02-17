# YoloGuard

Full-team guardrails for AI coding agents. Lives in Slack.

[![npm version](https://img.shields.io/npm/v/yologuard.svg)](https://npmjs.org/yologuard)
[![MIT License](http://img.shields.io/:license-mit-blue.svg)](https://github.com/yologuard/yologuard)

Default-deny Docker sandbox for AI coding agents. Agents code fast inside isolated containers while humans stay in control via an approval system.

**Status:** Pre-alpha (v0.0.1)

## Quick Start

```bash
npx yologuard launch --agent claude .
```

## What It Does

YoloGuard wraps AI coding agents (Claude Code, Codex, etc.) in a Docker sandbox with:

- **Default-deny networking** — containers start with `--network=none`, only allowlisted domains get through
- **Approval system** — agents request permissions (`egress.allow`, `git.push`, `pr.create`), humans approve
- **Credential isolation** — real tokens never enter the container; a gateway-side credential helper issues scoped, short-lived creds
- **Audit trail** — every approval, git operation, and network request logged to SQLite
- **DevContainer support** — works with existing `.devcontainer/` configs or auto-detects your stack

## Commands

```
yologuard start              Start the gateway server
yologuard doctor             Validate environment (Docker, config, Node.js)
yologuard launch [path]      Create a sandbox and launch an agent
yologuard list               List active sandboxes
yologuard attach <sandbox>   Attach to agent's tmux session
yologuard logs <sandbox>     Show sandbox container logs
yologuard stop <sandbox-id>  Stop and destroy a sandbox
yologuard warm               Pre-fetch repos into local cache
yologuard audit <sandbox>    Show audit log for a sandbox
yologuard approvals <id>     List pending approvals for a sandbox
yologuard approve <id> <req> Approve or deny a pending request
yologuard revoke <id> <appr> Revoke a previously granted approval
```

## Requirements

- Node.js >= 22
- Docker

## Configuration

Config lives at `~/.yologuard/yologuard.json` (JSON5 supported).

```json5
{
  gateway: { host: "127.0.0.1", port: 4200 },
  workspaces: {
    "my-project": {
      repos: [{ url: "github.com/org/repo", access: "read-write" }]
    }
  }
}
```

## License

MIT
