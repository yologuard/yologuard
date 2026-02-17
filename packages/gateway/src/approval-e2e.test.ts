import { createConnection } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLogger } from '@yologuard/shared'
import { createApprovalStore } from './approvals.js'
import { createApprovalHandler } from './approval-handler.js'
import { createSocketServer } from './socket.js'
import { createOpenApiBackend } from './openapi.js'
import { registerRoutes } from './routes/index.js'
import { createSandboxStore } from './store.js'

const logger = createLogger({ name: 'test-approval-e2e' })

let socketCounter = 0
const getTestSocketPath = () =>
  join(tmpdir(), `yg-approval-e2e-${process.pid}-${++socketCounter}.sock`)

const sendSocketRequest = ({
  socketPath,
  request,
}: {
  readonly socketPath: string
  readonly request: Record<string, unknown>
}): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const client = createConnection(socketPath, () => {
      client.write(JSON.stringify(request) + '\n')
    })

    let data = ''
    client.on('data', (chunk) => {
      data += chunk.toString()
      if (data.includes('\n')) {
        client.end()
        resolve(JSON.parse(data.trim()) as Record<string, unknown>)
      }
    })

    client.on('error', reject)
  })

const mockReply = () => ({ status: () => ({ send: () => {} }), sent: false }) as never

describe('Approval e2e: socket request → HTTP approve → socket response', () => {
  it('should block a socket approval request until the HTTP API approves it', async () => {
    const socketPath = getTestSocketPath()
    const sandboxStore = createSandboxStore({
      stateDir: `/tmp/yologuard-test-${crypto.randomUUID()}`,
    })
    const approvalStore = createApprovalStore()
    const approvalHandler = createApprovalHandler({ approvalStore, logger })

    // Wire up socket server with the real approval flow from server.ts
    const socketServer = createSocketServer({
      socketPath,
      logger,
      onRequest: async (request) => {
        const response = approvalHandler.onRequest(JSON.stringify(request))
        if (!response.success) return response

        const requestId = response.data?.requestId as string
        const decision = await approvalHandler.waitForDecision(requestId)
        return {
          type: 'approval_response',
          success: true,
          data: {
            approved: decision.approved,
            scope: decision.scope,
            reason: decision.reason,
          } as Record<string, unknown>,
        }
      },
    })

    await socketServer.start()

    // Create a sandbox in the store (required for the HTTP approve endpoint)
    const sandbox = sandboxStore.create({
      repo: '/tmp/test-repo',
      agent: 'claude',
    })

    // Wire up HTTP routes with real approval store + handler
    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: {
        store: sandboxStore,
        logger,
        approvalStore,
        approvalHandler,
      },
    })

    // 1. Simulate an agent sending an approval request via socket (this blocks)
    const socketResponsePromise = sendSocketRequest({
      socketPath,
      request: {
        type: 'egress.allow',
        sandboxId: sandbox.id,
        payload: { domain: 'api.stripe.com' },
        reason: 'Need to call Stripe API',
      },
    })

    // 2. Wait for the request to be registered
    await new Promise((r) => setTimeout(r, 100))

    // Verify the request is pending
    const pending = approvalStore.listPending(sandbox.id)
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('egress.allow')
    expect(pending[0].payload).toEqual({ domain: 'api.stripe.com' })

    // 3. Approve the request via HTTP API (like CLI would)
    await api.handleRequest(
      {
        method: 'POST',
        path: `/sandboxes/${sandbox.id}/approve`,
        headers: { 'content-type': 'application/json' },
        body: {
          requestId: pending[0].id,
          approved: true,
          scope: 'session',
        },
      },
      {} as never,
      mockReply(),
    )

    // 4. The socket response should now resolve with the approval
    const socketResponse = await socketResponsePromise
    expect(socketResponse.success).toBe(true)
    expect((socketResponse.data as Record<string, unknown>).approved).toBe(true)
    expect((socketResponse.data as Record<string, unknown>).scope).toBe('session')

    // 5. Request is no longer pending
    expect(approvalStore.listPending(sandbox.id)).toHaveLength(0)

    await socketServer.stop()
  })

  it('should return denial when HTTP API denies the request', async () => {
    const socketPath = getTestSocketPath()
    const sandboxStore = createSandboxStore({
      stateDir: `/tmp/yologuard-test-${crypto.randomUUID()}`,
    })
    const approvalStore = createApprovalStore()
    const approvalHandler = createApprovalHandler({ approvalStore, logger })

    const socketServer = createSocketServer({
      socketPath,
      logger,
      onRequest: async (request) => {
        const response = approvalHandler.onRequest(JSON.stringify(request))
        if (!response.success) return response

        const requestId = response.data?.requestId as string
        const decision = await approvalHandler.waitForDecision(requestId)
        return {
          type: 'approval_response',
          success: true,
          data: {
            approved: decision.approved,
            scope: decision.scope,
            reason: decision.reason,
          } as Record<string, unknown>,
        }
      },
    })

    await socketServer.start()

    const sandbox = sandboxStore.create({ repo: '/tmp/test-repo', agent: 'claude' })

    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: { store: sandboxStore, logger, approvalStore, approvalHandler },
    })

    // Agent requests push access
    const socketResponsePromise = sendSocketRequest({
      socketPath,
      request: {
        type: 'git.push',
        sandboxId: sandbox.id,
        payload: { remote: 'origin', branch: 'main' },
        reason: 'Want to push changes',
      },
    })

    await new Promise((r) => setTimeout(r, 100))
    const pending = approvalStore.listPending(sandbox.id)

    // Human denies the request
    await api.handleRequest(
      {
        method: 'POST',
        path: `/sandboxes/${sandbox.id}/approve`,
        headers: { 'content-type': 'application/json' },
        body: {
          requestId: pending[0].id,
          approved: false,
          scope: 'once',
          reason: 'Protected branch',
        },
      },
      {} as never,
      mockReply(),
    )

    const socketResponse = await socketResponsePromise
    expect(socketResponse.success).toBe(true)
    expect((socketResponse.data as Record<string, unknown>).approved).toBe(false)
    expect((socketResponse.data as Record<string, unknown>).reason).toBe('Protected branch')

    await socketServer.stop()
  })

  it('should handle multiple concurrent approval requests', async () => {
    const socketPath = getTestSocketPath()
    const sandboxStore = createSandboxStore({
      stateDir: `/tmp/yologuard-test-${crypto.randomUUID()}`,
    })
    const approvalStore = createApprovalStore()
    const approvalHandler = createApprovalHandler({ approvalStore, logger })

    const socketServer = createSocketServer({
      socketPath,
      logger,
      onRequest: async (request) => {
        const response = approvalHandler.onRequest(JSON.stringify(request))
        if (!response.success) return response

        const requestId = response.data?.requestId as string
        const decision = await approvalHandler.waitForDecision(requestId)
        return {
          type: 'approval_response',
          success: true,
          data: {
            approved: decision.approved,
            scope: decision.scope,
          } as Record<string, unknown>,
        }
      },
    })

    await socketServer.start()

    const sandbox = sandboxStore.create({ repo: '/tmp/test-repo', agent: 'claude' })

    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: { store: sandboxStore, logger, approvalStore, approvalHandler },
    })

    // Two concurrent requests from the sandbox
    const egressPromise = sendSocketRequest({
      socketPath,
      request: {
        type: 'egress.allow',
        sandboxId: sandbox.id,
        payload: { domain: 'npmjs.org' },
      },
    })

    const pushPromise = sendSocketRequest({
      socketPath,
      request: {
        type: 'git.push',
        sandboxId: sandbox.id,
        payload: { remote: 'origin' },
      },
    })

    await new Promise((r) => setTimeout(r, 200))

    const pending = approvalStore.listPending(sandbox.id)
    expect(pending).toHaveLength(2)

    // Approve both in order
    for (const req of pending) {
      await api.handleRequest(
        {
          method: 'POST',
          path: `/sandboxes/${sandbox.id}/approve`,
          headers: { 'content-type': 'application/json' },
          body: { requestId: req.id, approved: true, scope: 'session' },
        },
        {} as never,
        mockReply(),
      )
    }

    const [egressResult, pushResult] = await Promise.all([egressPromise, pushPromise])

    expect((egressResult.data as Record<string, unknown>).approved).toBe(true)
    expect((pushResult.data as Record<string, unknown>).approved).toBe(true)
    expect(approvalStore.listPending(sandbox.id)).toHaveLength(0)

    await socketServer.stop()
  })
})
