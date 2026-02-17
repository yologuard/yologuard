# YoloGuard

Full-team guardrails for AI coding agents. Lives in Slack.

**Status:** Pre-alpha

## Development

```bash
pnpm install
pnpm build
pnpm test          # unit tests (305+, no Docker needed)
pnpm test:e2e      # E2E tests (requires Docker, launches real sandboxes)
```

## Test the CLI

```bash
pnpm yologuard doctor
pnpm start                              # gateway on :4200
pnpm yologuard launch --agent claude .   # needs Docker
```

## Publish

```bash
pnpm release
```

## License

MIT
