# YoloGuard

Guardrails for AI coding agents. Lives in Slack.

## Quick Context

- **What:** Default-deny Docker sandbox for AI coding agents with approval system, multi-repo support, and Slack interface
- **Status:** Pre-alpha. Skeleton only — `src/index.ts` prints version and exits
- **Phase:** Building v0.1 (CLI sandbox + security layers). No Slack, no web UI, no GitLab yet.

## Key Docs

- `PRODUCT.md` — Full product design (architecture, security model, UX, threat model, competitive landscape)
- `ROADMAP.md` — Build order plan with 11 milestones (M0–M11), dependency graph, and critical path

## Target Monorepo Structure (after M0)

```
packages/
├── cli/                  # CLI entry point
├── gateway/              # Control plane (HTTP + WebSocket + Docker API)
├── sandbox/              # Sandbox manager (wraps @devcontainers/cli)
├── credentials/          # Git credential helper + token store
├── pr-client/            # GitHub REST client for PR creation
├── egress/               # Squid sidecar config, DNS resolver, allowlist
├── audit/                # Audit logger (SQLite via better-sqlite3)
├── indexer/              # Codebase indexer (tree-sitter)
└── shared/               # Shared types, config schema, constants
images/sandbox/           # Base Dockerfile
features/security/        # DevContainer Feature (credential helper, proxy, audit)
```

## Critical Path (v0.1)

M0 (scaffolding) → M1 (gateway) → M2 (sandbox lifecycle) → M3 (network isolation) → M4 (approval system) → M5 (credential helper) → M6 (PR creation)

## Architecture in One Paragraph

Gateway (Node.js) manages Docker sandboxes built on the DevContainer standard. Containers launch with `--network=none` (host-enforced). A Squid sidecar per sandbox handles egress filtering. Git credentials flow through a custom credential helper that talks to the gateway over a unix socket — real tokens never enter the container. Agents request permissions via `yologuard-request` tool, humans approve by category (not per-command). PRs created via gateway REST client, not `gh`/`glab` CLI. SQLite audit trail per sandbox.

## Tech Choices

- **Runtime:** Node.js 22, TypeScript, ESM
- **Build:** Turborepo monorepo (planned)
- **HTTP:** Fastify + `openapi-backend` (API-first — OpenAPI spec is source of truth, handlers registered by operationId)
- **Sandboxing:** Docker + `@devcontainers/cli`
- **Network:** `--network=none` + Squid sidecar + controlled DNS
- **Config:** JSON5, stored in `~/.yologuard/`
- **Audit:** SQLite via `better-sqlite3`
- **Indexing:** tree-sitter for multi-language AST parsing
- **Git:** Custom credential helper protocol, gateway-side token management
- **PR creation:** Minimal REST client (GitHub API only in v0.1)

## Code style

- Write tests to prove your work
- Prioritise project biome configuration and established patterns
- If a function takes more than one parameter, use the params object pattern with destructuring
- Prefer modules over classes
- Prefer arrow functions over `function` keyword
- Use `as const` for config objects, `satisfies` over `as`, `unknown` over `any`
- Comments only when "why" isn't obvious
- Keep functions small and testable

## Testing

- Vitest with globals enabled — no test imports needed
- Colocate test files next to implementation: `{module-name}.test.ts`
- Follow Given-When-Then pattern in test body
- Test behavior, not implementation details
- Use descriptive test names that explain expected behavior
- Keep tests focused, independent, and with realistic data

<!-- docs-index -->
[YoloGuard Docs Index]|root: ./docs|IMPORTANT: Read relevant docs before making changes|{error-handling.md}|openapi-backend:{intro.md,operation-handlers.md,request-lifecycle.md,request-validation.md,response-validation.md,mocking.md,security-handlers.md,typescript.md,api.md}|openapi-client-axios:{operation-methods.md,typegen.md,bundling.md,api.md,intro.md}|{typescript-code-style.md}
<!-- /docs-index -->
