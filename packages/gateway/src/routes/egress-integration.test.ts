import { createSandboxStore, type SandboxStore } from '../store.js'
import { createOpenApiBackend } from '../openapi.js'
import { createLogger } from '@yologuard/shared'
import { registerRoutes, type EgressDeps } from './index.js'

const logger = createLogger({ name: 'test-egress' })

const createMockEgress = (): {
  egress: EgressDeps
  calls: string[]
} => {
  const calls: string[] = []
  const egress: EgressDeps = {
    createSandboxNetwork: vi.fn(async () => {
      calls.push('createSandboxNetwork')
      return { id: 'net-123' }
    }),
    createSidecar: vi.fn(async () => {
      calls.push('createSidecar')
      return { id: 'sidecar-123' }
    }),
    connectToNetwork: vi.fn(async () => {
      calls.push('connectToNetwork')
    }),
    disconnectFromNetwork: vi.fn(async () => {
      calls.push('disconnectFromNetwork')
    }),
    destroySidecar: vi.fn(async () => {
      calls.push('destroySidecar')
    }),
    destroySandboxNetwork: vi.fn(async () => {
      calls.push('destroySandboxNetwork')
    }),
    getPresetAllowlist: vi.fn((preset) => {
      calls.push(`getPresetAllowlist:${preset}`)
      if (preset === 'node-web') {
        return ['registry.npmjs.org', 'github.com', 'api.github.com', 'nodejs.org']
      }
      return []
    }),
    getProxyEnvVars: vi.fn(({ sidecarIp }) => {
      calls.push('getProxyEnvVars')
      return {
        HTTP_PROXY: `http://${sidecarIp}:3128`,
        HTTPS_PROXY: `http://${sidecarIp}:3128`,
        NO_PROXY: 'localhost,127.0.0.1',
      }
    }),
  }
  return { egress, calls }
}

const mockResolveConfig = vi.fn(async ({ sandboxId }: { sandboxId: string }) => ({
  config: {
    name: `yologuard-${sandboxId}`,
    build: { dockerfile: 'Dockerfile' },
    containerEnv: { YOLOGUARD_SANDBOX_ID: sandboxId },
    runArgs: [
      '--network',
      'none',
      '--label',
      'yologuard=true',
      '--label',
      `yologuard.sandbox-id=${sandboxId}`,
    ],
    remoteUser: 'node',
    customizations: { yologuard: { sandboxId, managed: true as const } },
  },
  dockerfile: 'FROM node:22',
  existing: true,
}))

const createMockSandboxManager = () => ({
  createSandbox: vi.fn(async () => ({
    containerId: 'container-abc',
    state: 'running',
  })),
  destroySandbox: vi.fn(async () => {}),
})

const createDestroyFn =
  ({
    store,
    egress,
    sandboxManager,
  }: {
    readonly store: SandboxStore
    readonly egress?: EgressDeps
    readonly sandboxManager?: ReturnType<typeof createMockSandboxManager>
  }) =>
  async (sandboxId: string) => {
    const sandbox = store.get(sandboxId)
    if (!sandbox) return

    if (sandboxManager) {
      try {
        await sandboxManager.destroySandbox({ id: sandboxId, workspacePath: sandbox.repo, logger })
      } catch {
        /* ignore */
      }
    }
    if (egress) {
      try {
        await egress.destroySidecar({ sandboxId, logger })
      } catch {
        /* ignore */
      }
      try {
        await egress.destroySandboxNetwork({ sandboxId, logger })
      } catch {
        /* ignore */
      }
    }
    store.remove(sandboxId)
  }

const setupTest = async ({
  egress,
  store,
  sandboxManager,
  resolveDevcontainerConfig,
}: {
  readonly egress?: EgressDeps
  readonly store: SandboxStore
  readonly sandboxManager?: ReturnType<typeof createMockSandboxManager>
  readonly resolveDevcontainerConfig?: typeof mockResolveConfig
}) => {
  const api = await createOpenApiBackend()
  registerRoutes({
    api,
    deps: {
      store,
      logger,
      sandboxManager,
      egress,
      resolveDevcontainerConfig,
      copySecurityFeature: vi.fn(async () => '/tmp/mock-security'),
      destroySandboxById: createDestroyFn({ store, egress, sandboxManager }),
    },
  })
  return api
}

const mockReply = () => ({ status: () => ({ send: () => {} }), sent: false }) as never

describe('Egress integration in provisioning', () => {
  let store: SandboxStore

  beforeEach(() => {
    store = createSandboxStore({ stateDir: `/tmp/yologuard-test-${crypto.randomUUID()}` })
  })

  it('should create network + sidecar before container, and override network in runArgs', async () => {
    const { egress, calls } = createMockEgress()
    const sandboxManager = createMockSandboxManager()
    const api = await setupTest({
      egress,
      store,
      sandboxManager,
      resolveDevcontainerConfig: mockResolveConfig,
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: '/tmp/test-repo', agent: 'claude', networkPolicy: 'node-web' },
      },
      {} as never,
      mockReply(),
    )

    // Wait for async provisioning to complete
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Verify egress setup functions were called
    expect(calls).toContain('getPresetAllowlist:node-web')
    expect(calls).toContain('getProxyEnvVars')
    expect(calls).toContain('createSandboxNetwork')
    expect(calls).toContain('createSidecar')

    // Network + sidecar created before container (no post-creation connect/disconnect)
    expect(calls).not.toContain('connectToNetwork')
    expect(calls).not.toContain('disconnectFromNetwork')

    const networkIdx = calls.indexOf('createSandboxNetwork')
    const sidecarIdx = calls.indexOf('createSidecar')
    expect(networkIdx).toBeLessThan(sidecarIdx)

    // Verify the container was started with the isolated network, not 'none'
    const createCall = sandboxManager.createSandbox.mock.calls[0][0]
    const runArgs = createCall.devcontainerConfig.runArgs as string[]
    const networkArgIdx = runArgs.indexOf('--network')
    expect(runArgs[networkArgIdx + 1]).toMatch(/^yologuard-/)
  })

  it('should pass correct allowlist for node-web policy', async () => {
    const { egress } = createMockEgress()
    const api = await setupTest({
      egress,
      store,
      sandboxManager: createMockSandboxManager(),
      resolveDevcontainerConfig: mockResolveConfig,
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: '/tmp/test-repo', networkPolicy: 'node-web' },
      },
      {} as never,
      mockReply(),
    )

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(egress.createSidecar).toHaveBeenCalledWith(
      expect.objectContaining({
        allowlist: ['registry.npmjs.org', 'github.com', 'api.github.com', 'nodejs.org'],
      }),
    )
  })

  it('should inject proxy env vars into devcontainer config', async () => {
    const { egress } = createMockEgress()
    let capturedConfig: Record<string, unknown> | undefined
    const sandboxManager = {
      createSandbox: vi.fn(async (params: { devcontainerConfig: Record<string, unknown> }) => {
        capturedConfig = params.devcontainerConfig
        return { containerId: 'container-abc', state: 'running' }
      }),
      destroySandbox: vi.fn(async () => {}),
    }

    const api = await setupTest({
      egress,
      store,
      sandboxManager,
      resolveDevcontainerConfig: mockResolveConfig,
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: '/tmp/test-repo' },
      },
      {} as never,
      mockReply(),
    )

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(capturedConfig).toBeDefined()
    const env = capturedConfig?.containerEnv as Record<string, string>
    expect(env.HTTP_PROXY).toMatch(/yologuard-squid-.*:3128/)
    expect(env.HTTPS_PROXY).toMatch(/yologuard-squid-.*:3128/)
    expect(env.NO_PROXY).toBe('localhost,127.0.0.1')
    expect(env.YOLOGUARD_SANDBOX_ID).toBeDefined()
  })

  it('should clean up egress resources on sandbox deletion', async () => {
    const { egress, calls } = createMockEgress()
    const api = await setupTest({ egress, store })

    // Given: a sandbox exists
    const sandbox = store.create({ repo: '/tmp/test-repo' })

    // When: it is deleted
    await api.handleRequest(
      {
        method: 'DELETE',
        path: `/sandboxes/${sandbox.id}`,
        headers: {},
      },
      {} as never,
      mockReply(),
    )

    // Then: egress cleanup was called in order (sidecar before network)
    expect(calls).toContain('destroySidecar')
    expect(calls).toContain('destroySandboxNetwork')
    expect(calls.indexOf('destroySidecar')).toBeLessThan(calls.indexOf('destroySandboxNetwork'))
  })

  it('should handle egress cleanup errors gracefully during deletion', async () => {
    const egress: EgressDeps = {
      createSandboxNetwork: vi.fn(),
      createSidecar: vi.fn(),
      connectToNetwork: vi.fn(),
      disconnectFromNetwork: vi.fn(),
      destroySidecar: vi.fn(async () => {
        throw new Error('sidecar already gone')
      }),
      destroySandboxNetwork: vi.fn(async () => {
        throw new Error('network already gone')
      }),
      getPresetAllowlist: vi.fn(() => []),
      getProxyEnvVars: vi.fn(() => ({})),
    }

    const api = await setupTest({ egress, store })
    const sandbox = store.create({ repo: '/tmp/test-repo' })

    const result = await api.handleRequest(
      {
        method: 'DELETE',
        path: `/sandboxes/${sandbox.id}`,
        headers: {},
      },
      {} as never,
      mockReply(),
    )

    expect(result.statusCode).toBe(200)
    expect(egress.destroySidecar).toHaveBeenCalled()
    expect(egress.destroySandboxNetwork).toHaveBeenCalled()
  })

  it('should abort sandbox creation if egress setup fails', async () => {
    const egress: EgressDeps = {
      ...createMockEgress().egress,
      createSandboxNetwork: vi.fn(async () => {
        throw new Error('Docker not available')
      }),
    }
    const sandboxManager = createMockSandboxManager()
    const api = await setupTest({
      egress,
      store,
      sandboxManager,
      resolveDevcontainerConfig: mockResolveConfig,
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: '/tmp/test-repo' },
      },
      {} as never,
      mockReply(),
    )

    await new Promise((resolve) => setTimeout(resolve, 200))

    // Container should never start if egress fails
    expect(sandboxManager.createSandbox).not.toHaveBeenCalled()

    // Sandbox should be marked as stopped
    const sandboxes = store.list()
    expect(sandboxes[0].state).toBe('stopped')
  })
})
