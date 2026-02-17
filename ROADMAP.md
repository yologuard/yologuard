# YoloGuard Build Order — v0.1

Concrete implementation plan for Phase 1: "Default-deny sandbox, approval system, multi-repo."

**Current state:** Turborepo monorepo (pnpm). M0 + M1 complete. Gateway serves validated REST API, Docker client ready, CLI skeleton with start/doctor/launch/list/stop commands. 50 tests passing.

**v0.1 exit criteria:** `npx yologuard launch --agent claude .` starts a default-deny sandbox, agent runs inside, agent can request permissions via `yologuard-request`, approver approves in CLI, agent creates PR via gateway, full audit trail exists.

---

## Dependency Graph

```
M0: Project Scaffolding
 │
 ├── M1: Gateway Skeleton ──────────────────────┐
 │    │                                          │
 │    ├── M2: Sandbox Lifecycle                  │
 │    │    │                                     │
 │    │    ├── M3: Network Isolation             │
 │    │    │    │                                │
 │    │    │    └── M4: Approval System ─────────┤
 │    │    │         │                           │
 │    │    │         ├── M5: Credential Helper   │
 │    │    │         │    │                      │
 │    │    │         │    └── M6: PR Creation    │
 │    │    │         │                           │
 │    │    │         └── M7: Audit Logger        │
 │    │    │                                     │
 │    │    └── M8: Multi-Repo Worktrees          │
 │    │         │                                │
 │    │         └── M9: Codebase Indexer         │
 │    │                                          │
 │    └── M10: CLI (grows with each milestone)   │
 │                                               │
 └── M11: Base Sandbox Image + DevContainer Feature
```

---

## M0: Project Scaffolding

> Get the monorepo building, shared types defined, config loading working.

**Why first:** Everything depends on shared types, config schema, and a working build pipeline.

### Tasks

- [x] Convert to Turborepo monorepo with `packages/` structure
  - `packages/shared` — types, config schema, constants
  - `packages/gateway` — control plane server
  - `packages/sandbox` — sandbox manager (wraps @devcontainers/cli)
  - `packages/credentials` — git credential helper
  - `packages/egress` — Squid sidecar config, DNS resolver, allowlist
  - `packages/audit` — audit logger (SQLite)
  - `packages/indexer` — codebase indexer (tree-sitter)
  - `packages/pr-client` — GitHub/GitLab PR creation REST client
  - `packages/cli` — CLI entry point
- [x] Shared config schema (JSON5) — `~/.yologuard/yologuard.json` + workspace configs
  - Config loader with resolution order: defaults → global → workspace → CLI flags → env vars
  - Zod schemas for validation
- [x] Shared types: `SandboxConfig`, `ApprovalRequest`, `ApprovalDecision`, `AuditEntry`, `WorkspaceConfig`
- [x] Basic logging (structured, leveled — `pino`)
- [x] `tsconfig` paths, ESM, build scripts, `turbo.json`
- [x] Dev tooling: `vitest` for tests, `biome` for lint/format

### Deliverable
`npm run build` succeeds across all packages. Shared types importable everywhere. Config loads and validates.

---

## M1: Gateway Skeleton

> HTTP + WebSocket server that other components plug into. API-first workflow. Manages Docker via dockerode.

**Why now:** The gateway is the control plane. Every other component talks to it.

**API-first:** Define the OpenAPI spec first, then implement handlers. `openapi-backend` validates requests/responses against the spec automatically — the spec is the source of truth, not the code.

### Tasks

- [x] OpenAPI 3.1 spec (`packages/gateway/openapi.yaml`):
  - `POST /sandboxes`, `GET /sandboxes`, `GET /sandboxes/:id`, `DELETE /sandboxes/:id`
  - `POST /sandboxes/:id/approve`, `GET /sandboxes/:id/approvals`
  - `GET /health`
- [x] Fastify server on `127.0.0.1:4200` (configurable)
- [x] `openapi-backend` wired into Fastify — routes defined by spec, handlers registered by operationId
- [x] Request/response validation via openapi-backend (spec-driven, no manual Zod for HTTP layer)
- [ ] WebSocket endpoint for real-time events (`/ws`)
- [x] Docker API client (`dockerode`) — list containers, create/remove, exec, inspect
- [x] Graceful shutdown — stop all sandboxes on SIGTERM/SIGINT
- [ ] Unix socket listener for in-sandbox communication (`/yologuard/gateway.sock`)

### Deliverable
Gateway starts, connects to Docker, serves validated REST API (backed by OpenAPI spec), creates/destroys bare containers. No security layers yet.

---

## M2: Sandbox Lifecycle

> Wrap `@devcontainers/cli` to build and manage sandbox containers. This is where the DevContainer standard integration lives.

**Depends on:** M1 (gateway to manage lifecycle)

### Tasks

- [ ] `SandboxManager` module — wraps `@devcontainers/cli` (`devcontainer up`, `devcontainer exec`, `devcontainer down`)
- [ ] Auto-detect repo stack (Node, Python, Go, Rust) and generate `devcontainer.json` when none exists
- [ ] Support existing `.devcontainer/devcontainer.json` seamlessly
- [ ] Mount workspace directory into container
- [ ] tmux session inside container for persistent agent terminal
- [ ] Agent launcher — start Claude Code / Codex / opencode inside tmux with `--dangerously-skip-permissions` (inside sandbox, this is safe)
- [ ] Container health monitoring (heartbeat check, OOM detection)
- [ ] Deterministic cleanup — destroy container + prune worktrees on stop
- [ ] Idle timeout — auto-destroy after configurable period (default: 30 min)
- [ ] Resource limits: CPU, memory, disk quota per container

### Deliverable
`gateway.createSandbox({ repo: "./my-repo", agent: "claude" })` builds a devcontainer, launches the agent, and returns a sandbox ID. Agent runs inside container.

---

## M3: Network Isolation

> Host-enforced default-deny networking. The single most important security layer.

**Depends on:** M2 (needs running sandbox containers to isolate)

### Tasks

- [ ] Launch containers with `--network=none` (no network interfaces except loopback)
- [ ] Create dedicated Docker internal network per sandbox for sidecar communication
- [ ] Squid sidecar container per sandbox:
  - SNI peek-and-splice for HTTPS (no MITM cert)
  - Domain allowlist/blocklist from config
  - Known exfiltration domain blocklist (pastebin.com, file.io, transfer.sh, ix.io, etc.)
  - DoH endpoint blocking (dns.google, cloudflare-dns.com)
  - Access logging (domain, allowed/blocked, timestamp)
- [ ] Inject `HTTP_PROXY` / `HTTPS_PROXY` env vars in sandbox pointing to Squid sidecar
- [ ] Controlled DNS resolver on the sidecar:
  - Only resolves allowlisted domains
  - NXDOMAIN for everything else
  - Container `/etc/resolv.conf` points to this resolver
- [ ] Fail-closed: if sidecar dies, sandbox has no network path
- [ ] Policy presets: `node-web`, `python-ml`, `fullstack`, `none` (default)
- [ ] Model API proxy route: `http://gateway:4200/v1/...` → forward to model provider

### Deliverable
Sandbox has zero internet access except through Squid sidecar. Only allowlisted domains resolve and connect. Verified by running `curl` inside container to blocked/allowed destinations.

---

## M4: Approval System

> `yologuard-request` tool inside sandbox. Gateway approval router. CLI prompts for approver.

**Depends on:** M3 (network isolation makes approval meaningful — without it, agent can bypass)

### Tasks

- [ ] `yologuard-request` binary/script installed in sandbox:
  - Talks to gateway over unix socket (`/yologuard/gateway.sock`)
  - Request types: `egress.allow`, `repo.add`, `secret.use`, `git.push`, `pr.create`
  - Blocks until approval (gateway pauses agent via tmux)
  - Returns structured response (approved/denied + reason)
- [ ] Gateway approval router:
  - Receives requests from sandbox over unix socket
  - Queues pending approvals per sandbox
  - Pauses agent (tmux send-keys freeze or SIGSTOP)
  - Dispatches to approver interface (CLI in v0.1)
  - Resumes agent on decision
- [ ] CLI approval interface:
  - Interactive prompt when approval needed: show request type, payload, reason
  - Options: approve once / approve for session / approve for TTL / deny (with reason)
  - `yologuard approve <sandbox-id> <request-id>` for non-interactive / scripting
- [ ] `/yologuard/approvals.json` readable by agent (current approval state)
- [ ] Approval revocation: `yologuard revoke <sandbox-id> <approval-id>`
- [ ] Dynamic egress: on `egress.allow` approval, update Squid config + DNS resolver live
- [ ] All approval decisions persisted for audit

### Deliverable
Agent calls `yologuard-request egress.allow { "domain": "stripe.com", "reason": "..." }` → CLI user sees approval prompt → approves → agent's Squid allowlist updated → agent can reach stripe.com.

---

## M5: Credential Helper + Push Gating

> Git credentials managed by gateway. Agent never holds real tokens.

**Depends on:** M4 (push requires approval flow)

### Tasks

- [ ] Custom git credential helper script installed in container's global gitconfig
- [ ] Credential helper talks to gateway over unix socket
- [ ] Gateway token store: holds real GitHub/GitLab PATs, issues scoped short-lived creds per request
- [ ] Branch allowlist: credential helper only returns creds for `yologuard/*` branches (configurable)
- [ ] Credential helper denies auth for:
  - Unapproved remotes
  - Protected branches (main, master, production)
  - Force push (pre-push hook as defense-in-depth)
  - Refspec tricks (e.g. `HEAD:main`)
- [ ] SSH (port 22) blocked at network level — all git goes through HTTPS
- [ ] `git.push` approval integration: agent requests push permission, approver grants, credential helper then issues creds
- [ ] Pre-push hook installed in all repos as defense-in-depth

### Deliverable
Agent commits locally (unrestricted), requests push permission, gets approved, pushes to `yologuard/fix-xyz` branch. Push to `main` denied at credential layer.

---

## M6: PR Creation

> Minimal gateway REST client for GitHub/GitLab PR creation.

**Depends on:** M5 (needs pushed branch to create PR from)

### Tasks

- [ ] `pr-client` package: minimal REST client for GitHub API
  - `POST /repos/:owner/:repo/pulls` — create PR
  - Create branch ref if needed
  - Return PR URL
- [ ] `yologuard-request pr.create` integration:
  - Agent calls `yologuard-request pr.create { "repo": "...", "branch": "...", "title": "...", "body": "..." }`
  - Gateway uses pr-client to create PR
  - Returns PR URL to agent
- [ ] No `gh` / `glab` binaries in sandbox — clear error message if agent tries to use them
- [ ] GitHub.com support only in v0.1 (GitLab in v0.2)

### Deliverable
Agent finishes work → pushes to `yologuard/fix-checkout-bug` → calls `yologuard-request pr.create` → PR appears on GitHub → URL returned to agent.

---

## M7: Audit Logger

> SQLite per sandbox. Log what matters for security review.

**Depends on:** M4 (approval decisions are the core of audit)

### Tasks

- [ ] `audit` package: SQLite via `better-sqlite3`
- [ ] Per-sandbox SQLite DB at `~/.yologuard/audit/<sandbox-id>.db`
- [ ] Log entries:
  - Approval decisions (type, requester, approver, scope, TTL, timestamp)
  - Git operations (push, fetch, branch create — with commit SHAs)
  - Network requests (destination domain, allowed/blocked, timestamp — from Squid logs)
  - High-level command log (agent commands, not every subprocess)
  - Sandbox lifecycle events (create, destroy, timeout)
- [ ] Size cap: default 50MB per DB, oldest-first pruning (approval records never pruned)
- [ ] Secret redaction pass: regex-based, best-effort (`Bearer`, `ghp_`, `sk-`, `AKIA`, high-entropy strings)
- [ ] `yologuard audit <sandbox-id>` CLI command — query and display audit log
- [ ] Structured JSON output option for programmatic access

### Deliverable
Every approval, git op, and network request is logged. `yologuard audit <sandbox>` shows a readable security timeline.

---

## M8: Multi-Repo Worktrees

> Host-side bare clone cache + git worktrees for near-instant multi-repo sandbox startup.

**Depends on:** M2 (sandbox lifecycle to mount worktrees into)

### Tasks

- [ ] Host-side bare clone cache at `~/.yologuard/repos/`
  - `git clone --bare` on first setup
  - `git fetch` for incremental updates
- [ ] Git worktrees from bare clones mounted into sandbox workspace
  - `git worktree add /sandbox/workspace/<repo-name> HEAD`
  - Near-instant, no object duplication
- [ ] Per-repo access control: `read-write` vs `readonly` (readonly = no credential helper creds for push)
- [ ] Sparse checkout support for large repos (configurable per repo)
- [ ] `yologuard warm` command — pre-fetch all repos for CI warm cache
- [ ] Workspace config: `repos[]` array with URL, access level, sparse paths
- [ ] Worktree cleanup on sandbox destroy (`git worktree prune`)

### Deliverable
`yologuard launch --repo org/frontend --repo org/backend --repo org/shared-types:readonly` → sandbox has all three repos mounted via worktrees in under 2 seconds (warm cache).

---

## M9: Codebase Indexer

> Structural map + symbol extraction across repos. Injected as AGENTS.md.

**Depends on:** M8 (needs multi-repo to index across repos)

### Tasks

- [ ] `indexer` package using `tree-sitter` for multi-language AST parsing
- [ ] Structural index: file tree with compressed descriptions (~4KB per repo, Vercel-style pipe-delimited format)
- [ ] Symbol extraction: exported functions, types, classes, interfaces
- [ ] Cross-repo dependency map: which packages import from which repos
- [ ] API surface map: endpoint definitions, route handlers
- [ ] Index cache: keyed by `repo + commit SHA` at `~/.yologuard/index/<repo>/<sha>/`
  - Skip indexing if cache hit
  - Delta indexing: only re-index changed files
- [ ] Compressed context injection: write `AGENTS.md` to workspace root at sandbox launch
- [ ] Hard token budget cap (default: 128KB). Prioritize: symbols in prompt > recently modified > directly relevant repos
- [ ] `yologuard index` CLI command (foreground)
- [ ] `yologuard index --background` (background mode)

### Deliverable
`yologuard index` builds compressed structural context across all workspace repos. Sandbox launches with `AGENTS.md` containing full codebase map. Agent understands service boundaries without being told.

---

## M10: CLI

> Thin wrapper over gateway REST API. Grows incrementally with each milestone.

**Depends on:** M1+ (grows as gateway capabilities grow)

### Tasks

Build incrementally alongside each milestone:

**After M1:**
- [x] `yologuard start` — start the gateway daemon
- [x] `yologuard doctor` — validate Docker, config, dependencies

**After M2:**
- [x] `yologuard launch [--agent <name>] [path]` — create sandbox + launch agent (stub — calls gateway API)
- [x] `yologuard list` — show active sandboxes
- [ ] `yologuard attach <sandbox>` — connect to agent's tmux session
- [x] `yologuard stop <sandbox>` / `yologuard destroy <sandbox>` — cleanup
- [ ] `yologuard logs <sandbox>` — stream sandbox logs

**After M4:**
- [ ] Approval prompts inline during `yologuard launch` (interactive)
- [ ] `yologuard approve <sandbox-id> <request-id>` (non-interactive)
- [ ] `yologuard revoke <sandbox-id> <approval-id>`
- [ ] `yologuard approvals list <sandbox-id>`

**After M7:**
- [ ] `yologuard audit <sandbox>` — view audit trail

**After M8:**
- [ ] `--repo` flag support (multiple repos)
- [ ] `yologuard warm` — pre-fetch repos

**After M9:**
- [ ] `yologuard index` / `yologuard index --background`

**Final polish:**
- [ ] `npx yologuard launch --agent claude .` just works (auto-detect everything)
- [ ] `yologuard config get/set/unset` (dot-path config access)
- [ ] `yologuard setup` — interactive guided setup (agent auth, workspace creation)
- [ ] `yologuard workspace create/list/use`
- [ ] `--preset` flag for security presets
- [ ] `--prompt` flag for initial agent prompt
- [ ] `--branch` flag for working branch
- [x] Help text, `--version`, error messages

### Deliverable
Complete CLI surface for v0.1. Zero-config `npx yologuard launch` experience.

---

## M11: Base Sandbox Image + DevContainer Feature

> Docker image and installable DevContainer Feature that injects security layers.

**Depends on:** M0 (needs shared types for feature config)
**Developed alongside:** M2–M5 (image and feature evolve as security layers are added)

### Tasks

- [ ] Base sandbox Dockerfile (`images/sandbox/Dockerfile`):
  - Debian bookworm-slim base
  - Common dev tools: git, curl, tmux, build-essential
  - Node.js 22, Python 3.12 (via devcontainer features)
  - Headless Chromium (for agent browser use)
  - Non-root user (`yologuard`)
  - Published to `ghcr.io/yologuard/sandbox:latest`
- [ ] YoloGuard DevContainer Feature (`features/security/`):
  - `devcontainer-feature.json` manifest
  - `install.sh` — installs into any devcontainer:
    - Git credential helper (→ gateway unix socket)
    - `yologuard-request` tool
    - `HTTP_PROXY` / `HTTPS_PROXY` env vars
    - `/etc/resolv.conf` override (→ controlled DNS)
    - Pre-push hook template
    - Audit hooks (shell history capture)
    - tmux config
  - Published to `ghcr.io/yologuard/features/security:1`
- [ ] Dev Container Templates for common stacks (`templates/node/`, `templates/python/`, etc.)

### Deliverable
Any devcontainer can add `"ghcr.io/yologuard/features/security:1"` to get the full security layer. Base image works out of the box for repos without a devcontainer.

---

## Build Order Summary

| Order | Milestone | Est. Effort | Depends On | Critical Path? |
|-------|-----------|-------------|------------|----------------|
| 1 | M0: Project Scaffolding | S | — | Yes |
| 2 | M1: Gateway Skeleton | M | M0 | Yes |
| 3 | M2: Sandbox Lifecycle | L | M1 | Yes |
| 3 | M11: Base Image + Feature | M | M0 | Yes (parallel with M2) |
| 4 | M3: Network Isolation | L | M2, M11 | Yes |
| 5 | M4: Approval System | L | M3 | Yes |
| 6 | M5: Credential Helper | M | M4 | Yes |
| 6 | M7: Audit Logger | M | M4 | No (parallel with M5) |
| 6 | M8: Multi-Repo Worktrees | M | M2 | No (parallel with M5) |
| 7 | M6: PR Creation | M | M5 | Yes |
| 8 | M9: Codebase Indexer | L | M8 | No |
| — | M10: CLI | — | Incremental | Yes (grows with each) |

**S** = small (1–3 days), **M** = medium (3–7 days), **L** = large (1–2 weeks)

### Critical Path

```
M0 → M1 → M2 → M3 → M4 → M5 → M6
```

Everything on this path blocks the core demo: "agent runs in sandbox, requests permissions, creates PR."

### Parallel Tracks (once M2 or M4 is done)

- **M8 (Multi-Repo) + M9 (Indexer):** can start after M2 is done. Does not block the security story.
- **M7 (Audit):** can start after M4. Wires into existing events.
- **M11 (Image + Feature):** starts alongside M2, evolves as layers are added.

---

## What v0.1 Does NOT Include

Explicitly cut to keep scope tight:

- Slack app (v0.2)
- Web UI / dashboard (v0.3)
- Web IDE / VS Code integration (v0.3)
- Verdaccio / devpi package registry proxies (v0.2)
- FINOS git-proxy (v0.2, evaluate)
- GitLab support (v0.2 — GitHub.com only in v0.1)
- GitHub OAuth flow (v0.2 — PATs only in v0.1)
- SAML/SSO, enterprise git (v0.2+)
- Shared box mode multi-user features (v0.2+)
- Doc indexing (v0.2)
- Port forwarding UI (v0.2)
- microVM backend (v0.4+)

---

## First Week Focus

If starting today, the first week should produce:

1. **Day 1–2:** M0 — Monorepo scaffolding, shared types, config schema, build pipeline
2. **Day 3–5:** M1 — Gateway HTTP server, Docker API client, REST routes for sandbox CRUD
3. **Day 5–7:** M2 (start) — devcontainer up/down, agent launch in tmux, basic lifecycle

By end of week 1: `yologuard launch --agent claude .` starts a container with Claude Code running inside. No security layers yet, but the skeleton works.
