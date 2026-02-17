/**
 * E2E tests for sandbox network isolation.
 *
 * Requires Docker. Exercises the real CLI + gateway + devcontainer pipeline.
 * NOT run in CI — use `pnpm test:e2e` locally.
 *
 * Prerequisites:
 *   - Docker running
 *   - `pnpm build` completed
 *   - No other yologuard gateway running on port 4200
 */

import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

const CLI_BIN = join(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'index.js')
const GATEWAY_URL = 'http://127.0.0.1:4200'

const cli = async (args: string[], { timeout = 30_000 }: { timeout?: number } = {}) => {
  const { stdout, stderr } = await execFile(process.execPath, [CLI_BIN, ...args], { timeout })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

const waitForGateway = async ({ maxWait = 15_000 }: { maxWait?: number } = {}) => {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${GATEWAY_URL}/health`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Gateway did not start within ${maxWait}ms`)
}

const dockerExec = async ({
  containerId,
  command,
  timeout = 15_000,
}: {
  readonly containerId: string
  readonly command: string
  readonly timeout?: number
}) => {
  try {
    const { stdout, stderr } = await execFile(
      'docker',
      ['exec', containerId, 'bash', '-c', command],
      { timeout },
    )
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? '').trim(),
      exitCode: e.code ?? 1,
    }
  }
}

const waitForGatewayDown = async ({ maxWait = 5_000 }: { maxWait?: number } = {}) => {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      await fetch(`${GATEWAY_URL}/health`)
      await new Promise((r) => setTimeout(r, 300))
    } catch {
      return
    }
  }
}

const stopExistingGateway = async () => {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`)
    if (!res.ok) return
  } catch {
    return // not running
  }

  await cli(['gateway', 'stop']).catch(() => {})
  await waitForGatewayDown()
}

let gatewayProcess: ChildProcess | undefined
let workDir: string
let sandboxId: string | undefined
let containerId: string | undefined

beforeAll(async () => {
  // Stop any existing gateway on port 4200
  await stopExistingGateway()

  // Create a temp workspace with a package.json so stack detection picks "node"
  workDir = await mkdtemp(join(tmpdir(), 'yologuard-e2e-'))
  await writeFile(
    join(workDir, 'package.json'),
    JSON.stringify({ name: 'e2e-test', version: '0.0.1' }),
  )

  // Start gateway in background
  gatewayProcess = spawn(process.execPath, [CLI_BIN, 'start'], { stdio: 'pipe' })
  gatewayProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) process.stderr.write(`  [gateway] ${line}\n`)
  })

  await waitForGateway()

  // Clean up any stale sandbox records from previous test runs
  const listRes = await fetch(`${GATEWAY_URL}/sandboxes`)
  if (listRes.ok) {
    const sandboxes = (await listRes.json()) as Array<{ id: string }>
    for (const sb of sandboxes) {
      await fetch(`${GATEWAY_URL}/sandboxes/${sb.id}`, { method: 'DELETE' }).catch(() => {})
    }
  }
}, 30_000)

afterAll(async () => {
  // Destroy sandbox if still around
  if (sandboxId) {
    try {
      await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`, { method: 'DELETE' })
    } catch {
      // best effort
    }
  }

  // Stop gateway
  if (gatewayProcess) {
    gatewayProcess.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      gatewayProcess?.on('exit', () => resolve())
      setTimeout(resolve, 5000)
    })
  }

  await rm(workDir, { recursive: true, force: true }).catch(() => {})
}, 30_000)

describe('sandbox network isolation (E2E)', () => {
  it('should create a sandbox via gateway API', async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: workDir, networkPolicy: 'node-web' }),
    })

    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; state: string }
    expect(body.id).toBeDefined()
    sandboxId = body.id
  }, 30_000)

  it('should wait for sandbox to reach running state', async () => {
    expect(sandboxId).toBeDefined()

    const maxWait = 180_000
    const start = Date.now()
    let state = 'creating'

    while (state === 'creating' && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 2_000))
      const res = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`)
      const body = (await res.json()) as { state: string; containerId?: string }
      state = body.state
      if (body.containerId) containerId = body.containerId
    }

    expect(state).toBe('running')
    expect(containerId).toBeDefined()
  }, 200_000)

  it('should not have bridge network access', async () => {
    expect(containerId).toBeDefined()

    // Container is on isolated internal network (or --network=none fallback).
    // Either way, it should NOT be on the default bridge network.
    const { stdout } = await dockerExec({
      containerId: containerId!,
      command:
        'docker inspect --format "{{json .NetworkSettings.Networks}}" ' +
        containerId! +
        ' 2>/dev/null || echo "skip"',
    })

    // If we can't inspect from inside, check from outside via the test runner
    const { stdout: inspectOut } = await execFile('docker', [
      'inspect',
      '--format',
      '{{json .NetworkSettings.Networks}}',
      containerId!,
    ])

    // Should NOT be on the "bridge" network
    expect(inspectOut).not.toContain('"bridge"')
  }, 15_000)

  it('should block outbound HTTP requests', async () => {
    expect(containerId).toBeDefined()

    // google.com is not in node-web allowlist — proxy should deny
    const result = await dockerExec({
      containerId: containerId!,
      command: 'curl -sf --connect-timeout 5 https://google.com 2>&1; echo "EXIT:$?"',
      timeout: 15_000,
    })

    expect(result.stdout).toMatch(/EXIT:[^0]/)
  }, 20_000)

  it('should block direct internet access (bypassing proxy)', async () => {
    expect(containerId).toBeDefined()

    // Try to reach google DNS directly (not through proxy) — should fail
    // because container is on isolated internal network with no route to internet
    const result = await dockerExec({
      containerId: containerId!,
      command: 'curl -sf --noproxy "*" --connect-timeout 3 http://8.8.8.8 2>&1; echo "EXIT:$?"',
      timeout: 10_000,
    })

    expect(result.stdout).toMatch(/EXIT:[^0]/)
  }, 15_000)

  it('should allow raw.githubusercontent.com with node-web egress preset', async () => {
    expect(containerId).toBeDefined()

    // node-web preset includes .githubusercontent.com — fetch should succeed via proxy
    const result = await dockerExec({
      containerId: containerId!,
      command:
        'curl -sf --connect-timeout 10 https://raw.githubusercontent.com/yologuard/yologuard/refs/heads/main/README.md 2>&1',
      timeout: 20_000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain('Quick Start')
  }, 30_000)

  it('should list the sandbox via CLI', async () => {
    expect(sandboxId).toBeDefined()

    const { stdout } = await cli(['list'])
    expect(stdout).toContain(sandboxId!.slice(0, 8))
  }, 15_000)

  it('should stop the sandbox via CLI', async () => {
    expect(sandboxId).toBeDefined()

    const { stdout } = await cli(['stop', sandboxId!])
    expect(stdout.toLowerCase()).toContain('destroyed')

    // Verify it's gone
    const res = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`)
    expect(res.status).toBe(404)

    sandboxId = undefined
    containerId = undefined
  }, 30_000)
})
