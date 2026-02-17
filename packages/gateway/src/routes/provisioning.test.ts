import { access, readdir, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { createSandboxStore, type SandboxStore } from '../store.js'
import { createOpenApiBackend } from '../openapi.js'
import { registerRoutes } from './index.js'
import { createLogger } from '@yologuard/shared'
import { copySecurityFeature } from '@yologuard/sandbox'

const logger = createLogger({ name: 'test-provisioning' })

const createMockSandboxManager = () => ({
  createSandbox: vi.fn(async () => ({
    containerId: 'container-abc',
    state: 'running',
  })),
  destroySandbox: vi.fn(async () => {}),
})

const mockReply = () => ({ status: () => ({ send: () => {} }), sent: false }) as never

describe('Provisioning e2e', () => {
  let store: SandboxStore
  let workspaceDir: string

  beforeEach(async () => {
    store = createSandboxStore({ stateDir: `/tmp/yologuard-test-${crypto.randomUUID()}` })
    workspaceDir = await mkdtemp(join(tmpdir(), 'yologuard-workspace-'))
  })

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true })
    // Clean up any generated config dirs
    for (const sandbox of store.list()) {
      if (sandbox.configPath) {
        const configBase = join(sandbox.configPath, '..', '..')
        await rm(configBase, { recursive: true, force: true }).catch(() => {})
      }
    }
  })

  it('should write config under ~/.yologuard/configs/<id>/, not in the workspace', async () => {
    const sandboxManager = createMockSandboxManager()
    const mockLaunchAgent = vi.fn(async () => {})

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
        features: { './security': {} },
        customizations: { yologuard: { sandboxId, managed: true as const } },
      },
      dockerfile: 'FROM node:22\nRUN npm install -g @anthropic-ai/claude-code',
      existing: false,
    }))

    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: {
        store,
        logger,
        sandboxManager,
        resolveDevcontainerConfig: mockResolveConfig,
        copySecurityFeature,
        launchAgent: mockLaunchAgent,
        destroySandboxById: async (id) => {
          store.remove(id)
        },
      },
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: workspaceDir, agent: 'claude' },
      },
      {} as never,
      mockReply(),
    )

    // Wait for fire-and-forget provisioning
    await new Promise((resolve) => setTimeout(resolve, 500))

    const sandbox = store.list()[0]
    const configsDir = join(homedir(), '.yologuard', 'configs', sandbox.id)
    const devcontainerDir = join(configsDir, '.devcontainer')

    // Config written under ~/.yologuard/configs/<id>/.devcontainer/
    const entries = await readdir(devcontainerDir)
    expect(entries).toContain('devcontainer.json')
    expect(entries).toContain('Dockerfile')
    expect(entries).toContain('security')

    // configPath stored in sandbox record
    expect(sandbox.configPath).toBe(join(devcontainerDir, 'devcontainer.json'))

    // devcontainer.json has features referencing ./security
    const configContent = JSON.parse(await readFile(sandbox.configPath!, 'utf-8'))
    expect(configContent.features).toEqual({ './security': {} })

    // Security feature copied correctly
    const featureFiles = await readdir(join(devcontainerDir, 'security'))
    expect(featureFiles).toContain('install.sh')
    expect(featureFiles).toContain('devcontainer-feature.json')

    // Dockerfile written alongside config
    const dockerfileContent = await readFile(join(devcontainerDir, 'Dockerfile'), 'utf-8')
    expect(dockerfileContent).toContain('FROM node:22')

    // Workspace dir stays clean — no .devcontainer/ created
    await expect(access(join(workspaceDir, '.devcontainer'))).rejects.toThrow()

    // createSandbox called with config base dir as workspacePath
    expect(sandboxManager.createSandbox).toHaveBeenCalledTimes(1)
    const createCall = sandboxManager.createSandbox.mock.calls[0][0]
    expect(createCall.workspacePath).toBe(configsDir)
    expect(createCall.configPath).toBe(join(devcontainerDir, 'devcontainer.json'))

    // Agent launched with config base dir as workspacePath
    expect(mockLaunchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', workspacePath: configsDir }),
    )
  })

  it('should launch with agent none and still generate config', async () => {
    const sandboxManager = createMockSandboxManager()
    const mockLaunchAgent = vi.fn(async () => {})

    const mockResolveConfig = vi.fn(async ({ sandboxId }: { sandboxId: string }) => ({
      config: {
        name: `yologuard-${sandboxId}`,
        build: { dockerfile: 'Dockerfile' },
        containerEnv: { YOLOGUARD_SANDBOX_ID: sandboxId },
        runArgs: ['--network', 'none', '--label', 'yologuard=true'],
        remoteUser: 'node',
        features: { './security': {} },
        customizations: { yologuard: { sandboxId, managed: true as const } },
      },
      dockerfile: 'FROM node:22',
      existing: false,
    }))

    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: {
        store,
        logger,
        sandboxManager,
        resolveDevcontainerConfig: mockResolveConfig,
        copySecurityFeature,
        launchAgent: mockLaunchAgent,
        destroySandboxById: async (id) => {
          store.remove(id)
        },
      },
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: workspaceDir, agent: 'none' },
      },
      {} as never,
      mockReply(),
    )

    await new Promise((resolve) => setTimeout(resolve, 500))

    const sandbox = store.list()[0]
    const configsDir = join(homedir(), '.yologuard', 'configs', sandbox.id)
    const devcontainerDir = join(configsDir, '.devcontainer')

    // Config still generated
    const entries = await readdir(devcontainerDir)
    expect(entries).toContain('devcontainer.json')
    expect(entries).toContain('security')

    // Dockerfile should NOT have agent install RUN
    const dockerfileContent = await readFile(join(devcontainerDir, 'Dockerfile'), 'utf-8')
    expect(dockerfileContent).not.toContain('npm install -g')

    // Workspace stays clean
    await expect(access(join(workspaceDir, '.devcontainer'))).rejects.toThrow()

    // Agent launcher was called with 'none'
    expect(mockLaunchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'none' }),
    )
  })

  it('should not write config or copy feature when existing devcontainer found', async () => {
    const sandboxManager = createMockSandboxManager()
    const mockLaunchAgent = vi.fn(async () => {})
    const mockCopyFeature = vi.fn(async () => '/mock')

    const mockResolveConfig = vi.fn(async ({ sandboxId }: { sandboxId: string }) => ({
      config: {
        name: `yologuard-${sandboxId}`,
        build: { dockerfile: 'Dockerfile' },
        containerEnv: { YOLOGUARD_SANDBOX_ID: sandboxId },
        runArgs: ['--network', 'none'],
        remoteUser: 'node',
        customizations: { yologuard: { sandboxId, managed: true as const } },
      },
      dockerfile: 'FROM node:22',
      existing: true,
    }))

    const api = await createOpenApiBackend()
    registerRoutes({
      api,
      deps: {
        store,
        logger,
        sandboxManager,
        resolveDevcontainerConfig: mockResolveConfig,
        copySecurityFeature: mockCopyFeature,
        launchAgent: mockLaunchAgent,
        destroySandboxById: async (id) => {
          store.remove(id)
        },
      },
    })

    await api.handleRequest(
      {
        method: 'POST',
        path: '/sandboxes',
        headers: { 'content-type': 'application/json' },
        body: { repo: workspaceDir, agent: 'claude' },
      },
      {} as never,
      mockReply(),
    )

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Feature copy skipped for existing config
    expect(mockCopyFeature).not.toHaveBeenCalled()

    // No .devcontainer/ created in workspace
    await expect(access(join(workspaceDir, '.devcontainer'))).rejects.toThrow()

    // No configPath stored
    const sandbox = store.list()[0]
    expect(sandbox.configPath).toBeUndefined()

    // Container was started with repo as workspacePath (no config dir redirect)
    expect(sandboxManager.createSandbox).toHaveBeenCalledTimes(1)
    const createCall = sandboxManager.createSandbox.mock.calls[0][0]
    expect(createCall.workspacePath).toBe(workspaceDir)

    expect(mockLaunchAgent).toHaveBeenCalledTimes(1)
  })
})
