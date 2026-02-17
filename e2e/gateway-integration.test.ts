/**
 * E2E integration tests for gateway, socket, approvals, and config CLI.
 *
 * These tests exercise real gateway process + unix socket communication
 * WITHOUT Docker — they test the control plane wiring.
 *
 * Prerequisites:
 *   - `pnpm build` completed
 *   - No other yologuard gateway running on port 4200
 */

import { execFile as execFileCb, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
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
    return
  }

  await cli(['gateway', 'stop']).catch(() => {})
  await waitForGatewayDown()
}

/** Send a JSON message to a unix socket and return the JSON response */
const socketRequest = ({
  socketPath,
  message,
}: {
  readonly socketPath: string
  readonly message: Record<string, unknown>
}): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const conn = createConnection(socketPath)
    let buffer = ''

    conn.on('connect', () => {
      conn.write(JSON.stringify(message) + '\n')
    })

    conn.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          conn.end()
          resolve(parsed)
          return
        } catch {
          // partial JSON, keep buffering
        }
      }
    })

    conn.on('error', reject)
    conn.on('close', () => {
      if (buffer.trim()) {
        try {
          resolve(JSON.parse(buffer.trim()))
        } catch {
          reject(new Error(`Invalid response: ${buffer}`))
        }
      }
    })

    setTimeout(() => {
      conn.destroy()
      reject(new Error('Socket request timed out'))
    }, 10_000)
  })

let socketPath: string
let gatewayProcess: ChildProcess | undefined

beforeAll(async () => {
  await stopExistingGateway()

  socketPath = join(homedir(), '.yologuard', 'gateway.sock')

  gatewayProcess = spawn(process.execPath, [CLI_BIN, 'start'], { stdio: 'pipe' })
  gatewayProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) process.stderr.write(`  [gw] ${line}\n`)
  })

  await waitForGateway()
}, 30_000)

afterAll(async () => {
  if (gatewayProcess) {
    gatewayProcess.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      gatewayProcess?.on('exit', () => resolve())
      setTimeout(resolve, 5000)
    })
  }
}, 15_000)

describe('gateway lifecycle (E2E)', () => {
  it('should respond to health check', async () => {
    const res = await fetch(`${GATEWAY_URL}/health`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { status: string; version: string; uptime: number }
    expect(body.status).toBe('ok')
    expect(body.version).toBeDefined()
    expect(body.uptime).toBeGreaterThan(0)
  })

  it('should return version from CLI', async () => {
    const { stdout } = await cli(['--version'])
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('should list sandboxes (empty)', async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('should return 404 for unknown sandbox', async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes/nonexistent-id`)
    expect(res.status).toBe(404)
  })

  it('should return 404 for unknown route', async () => {
    const res = await fetch(`${GATEWAY_URL}/does-not-exist`)
    expect(res.status).toBe(404)
  })
})

describe('socket server (E2E)', () => {
  it('should accept connections and respond to invalid requests', async () => {
    const response = await socketRequest({
      socketPath,
      message: { type: 'unknown.type', sandboxId: 'test', payload: {} },
    })

    expect(response.success).toBe(false)
  })

  it('should reject credential requests for unapproved remotes', async () => {
    const response = await socketRequest({
      socketPath,
      message: {
        type: 'credential.get',
        sandboxId: 'test-sandbox',
        payload: {
          protocol: 'https',
          host: 'github.com',
          path: 'org/repo.git',
        },
      },
    })

    expect(response.type).toBe('credential_response')
    expect(response.success).toBe(false)
  })
})

describe('approval flow (E2E)', () => {
  let sandboxId: string

  beforeAll(async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: '/tmp/fake-repo' }),
    })
    const body = (await res.json()) as { id: string }
    sandboxId = body.id
  })

  afterAll(async () => {
    if (sandboxId) {
      try {
        await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`, { method: 'DELETE' })
      } catch {
        // best effort
      }
    }
  })

  it('should create sandbox and list it', async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; state: string }
    expect(body.id).toBe(sandboxId)
  })

  it('should submit approval request via socket and list it via API', async () => {
    // Connect to socket — the response blocks until a human approves
    const conn = createConnection(socketPath)

    await new Promise<void>((resolve, reject) => {
      conn.on('connect', () => {
        conn.write(
          JSON.stringify({
            type: 'egress.allow',
            sandboxId,
            payload: { domain: 'stripe.com' },
            reason: 'need payment API',
          }) + '\n',
        )
        resolve()
      })
      conn.on('error', reject)
    })

    // Poll for the approval to appear (the socket handler registers it synchronously
    // but there may be event-loop delay between socket data and handler dispatch)
    type ApprovalEntry = {
      id: string
      type: string
      sandboxId: string
      payload: Record<string, unknown>
      reason?: string
    }
    let egressApproval: ApprovalEntry | undefined
    const pollStart = Date.now()
    while (!egressApproval && Date.now() - pollStart < 5000) {
      await new Promise((r) => setTimeout(r, 300))
      const res = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}/approvals`)
      if (res.status === 200) {
        const approvals = (await res.json()) as ApprovalEntry[]
        egressApproval = approvals.find((a) => a.type === 'egress.allow')
      }
    }

    expect(egressApproval).toBeDefined()
    expect(egressApproval!.payload).toEqual({ domain: 'stripe.com' })
    expect(egressApproval!.reason).toBe('need payment API')

    // Approve the request via HTTP
    const approveRes = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: egressApproval!.id,
        approved: true,
        scope: 'session',
      }),
    })
    expect(approveRes.status).toBe(200)

    // The socket connection should now receive the decision
    const response = await new Promise<string>((resolve) => {
      let buffer = ''
      conn.on('data', (chunk) => {
        buffer += chunk.toString()
        if (buffer.includes('\n')) {
          conn.end()
          resolve(buffer.trim())
        }
      })
      setTimeout(() => {
        conn.end()
        resolve(buffer.trim())
      }, 5000)
    })

    const decision = JSON.parse(response)
    expect(decision.success).toBe(true)
    expect(decision.data?.approved).toBe(true)

    conn.destroy()
  }, 20_000)

  it('should list the sandbox via CLI list command', async () => {
    const { stdout } = await cli(['list'])
    expect(stdout).toContain(sandboxId.slice(0, 8))
  })

  it('should delete sandbox', async () => {
    const res = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const check = await fetch(`${GATEWAY_URL}/sandboxes/${sandboxId}`)
    expect(check.status).toBe(404)

    sandboxId = undefined!
  })
})

describe('config CLI (E2E)', () => {
  it('should get default gateway port', async () => {
    const { stdout } = await cli(['config', 'get', 'gateway.port'])
    expect(stdout).toContain('4200')
  })

  it('should set and get a config value', async () => {
    await cli(['config', 'set', 'sandbox.agent', 'claude'])

    const { stdout } = await cli(['config', 'get', 'sandbox.agent'])
    expect(stdout).toContain('claude')

    await cli(['config', 'unset', 'sandbox.agent'])
  })

  it('should unset a config value', async () => {
    await cli(['config', 'set', 'sandbox.agent', 'codex'])
    await cli(['config', 'unset', 'sandbox.agent'])

    const { stdout } = await cli(['config', 'get', 'sandbox.agent'])
    // Should show default or empty
    expect(stdout).not.toContain('codex')
  })
})
