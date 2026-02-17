import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PolicyPreset } from '@yologuard/egress'
import type { AgentType, DevcontainerConfig } from '@yologuard/sandbox'
import {
  type Logger,
  type SandboxState,
  SOCKET_PATH,
  YOLOGUARD_VERSION,
  type YologuardConfig,
} from '@yologuard/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Context, OpenAPIBackend } from 'openapi-backend'
import type { ApprovalHandler } from '../approval-handler.js'
import type { ApprovalStore } from '../approvals.js'
import type { ErrorResponse, HandlerResponse, OperationHandler } from '../types/openapi.d.ts'

const startTime = Date.now()

type FastifyHandlerArgs = [FastifyRequest, FastifyReply]

// Typed response helper — T is inferred from data at the call site.
// Inside an OperationHandler, the return type is already constrained,
// so no explicit type params or casts are needed by the caller.
const replyJSON = <T>({
  data,
  reply,
  status,
}: {
  readonly data: T
  readonly reply: FastifyReply
  readonly status: number
}): HandlerResponse<T> => {
  reply.status(status).send(data)
  return { statusCode: status, body: data }
}

const replyError = ({
  reply,
  status,
  error,
}: {
  readonly reply: FastifyReply
  readonly status: number
  readonly error: string
}): HandlerResponse<ErrorResponse> => replyJSON({ data: { status, error }, reply, status })

type SandboxRecord = {
  readonly id: string
  readonly repo: string
  readonly agent?: string
  readonly branch?: string
  readonly state: SandboxState
  readonly createdAt: string
  readonly containerId?: string
  readonly networkPolicy?: string
  readonly configPath?: string
  readonly remoteUser?: string
  readonly allowlist?: readonly string[]
}

type SandboxStore = {
  readonly create: (params: {
    readonly repo: string
    readonly agent?: string
    readonly branch?: string
    readonly networkPolicy?: string
  }) => SandboxRecord
  readonly get: (id: string) => SandboxRecord | undefined
  readonly list: () => SandboxRecord[]
  readonly remove: (id: string) => boolean
  readonly update: (id: string, updates: Partial<SandboxRecord>) => SandboxRecord | undefined
}

type SandboxManager = {
  readonly createSandbox: (params: {
    readonly id: string
    readonly workspacePath: string
    readonly devcontainerConfig: DevcontainerConfig
    readonly resourceLimits?: { cpus?: number; memoryMb?: number; diskMb?: number }
    readonly configPath?: string
    readonly logger: Logger
  }) => Promise<{ containerId: string; state: string }>
  readonly destroySandbox: (params: {
    readonly id: string
    readonly workspacePath: string
    readonly logger: Logger
  }) => Promise<void>
}

export type EgressDeps = {
  readonly createSandboxNetwork: (params: {
    readonly sandboxId: string
    readonly logger: Logger
  }) => Promise<{ id: string }>
  readonly createSidecar: (params: {
    readonly sandboxId: string
    readonly networkName: string
    readonly allowlist: readonly string[]
    readonly blocklist?: readonly string[]
    readonly logger: Logger
  }) => Promise<{ id: string }>
  readonly connectToNetwork: (params: {
    readonly containerId: string
    readonly networkName: string
  }) => Promise<void>
  readonly disconnectFromNetwork: (params: {
    readonly containerId: string
    readonly networkName: string
  }) => Promise<void>
  readonly destroySidecar: (params: {
    readonly sandboxId: string
    readonly logger: Logger
  }) => Promise<void>
  readonly destroySandboxNetwork: (params: {
    readonly sandboxId: string
    readonly logger: Logger
  }) => Promise<void>
  readonly getPresetAllowlist: (preset: PolicyPreset) => string[]
  readonly getProxyEnvVars: (params: {
    readonly sidecarIp: string
    readonly sidecarPort?: number
  }) => Record<string, string>
  readonly updateAllowlist?: (params: {
    readonly sandboxId: string
    readonly allowlist: readonly string[]
    readonly logger: Logger
  }) => Promise<void>
}

export type RouteDeps = {
  readonly store: SandboxStore
  readonly logger: Logger
  readonly approvalStore?: ApprovalStore
  readonly sandboxManager?: SandboxManager
  readonly egress?: EgressDeps
  readonly destroySandboxById?: (sandboxId: string) => Promise<void>
  readonly inspectContainer?: (
    containerId: string,
  ) => Promise<{ State: { Running: boolean; OOMKilled: boolean; Status: string } }>
  readonly resolveDevcontainerConfig?: (params: {
    readonly workspacePath: string
    readonly sandboxId: string
    readonly agent?: AgentType
    readonly resourceLimits?: { cpus?: number; memoryMb?: number; diskMb?: number }
  }) => Promise<{ config: DevcontainerConfig; dockerfile: string; existing: boolean }>
  readonly launchAgent?: (params: {
    readonly workspacePath: string
    readonly agent: AgentType
    readonly prompt?: string
    readonly configPath?: string
    readonly logger: Logger
  }) => Promise<void>
  readonly startHealthMonitor?: (params: {
    readonly sandboxId: string
    readonly container: {
      inspect: () => Promise<{ State: { Running: boolean; OOMKilled: boolean; Status: string } }>
    }
    readonly idleTimeoutMs?: number
    readonly logger: Logger
    readonly onTimeout: (sandboxId: string) => void | Promise<void>
    readonly onUnhealthy: (params: { sandboxId: string; reason: string }) => void | Promise<void>
  }) => void
  readonly stopHealthMonitor?: (sandboxId: string) => void
  readonly userConfig?: YologuardConfig
  readonly approvalHandler?: ApprovalHandler
  readonly copySecurityFeature?: (params: { readonly targetDir: string }) => Promise<string>
  readonly approveRemote?: (params: { readonly sandboxId: string; readonly remote: string }) => void
  readonly tokenStore?: unknown
  readonly gatewaySocketPath?: string
}

export const registerRoutes = ({
  api,
  deps,
}: {
  readonly api: OpenAPIBackend
  readonly deps: RouteDeps
}) => {
  const { store, logger } = deps

  const getHealth: OperationHandler<'getHealth', FastifyHandlerArgs> = async (_c, _req, reply) =>
    replyJSON({
      data: {
        status: 'ok',
        version: YOLOGUARD_VERSION,
        uptime: (Date.now() - startTime) / 1000,
      },
      reply,
      status: 200,
    })

  const configDefaults = deps.userConfig

  const provisionSandbox = async ({
    sandboxId,
    repo,
    agent,
    networkPolicy,
  }: {
    readonly sandboxId: string
    readonly repo: string
    readonly agent?: string
    readonly networkPolicy?: string
  }) => {
    const effectivePolicy = networkPolicy ?? configDefaults?.sandbox.networkPolicy ?? 'none'
    if (!deps.sandboxManager || !deps.resolveDevcontainerConfig) return

    try {
      // Resolve egress allowlist from network policy preset + config-level lists
      const presetAllowlist = deps.egress
        ? deps.egress.getPresetAllowlist(effectivePolicy as PolicyPreset)
        : []
      const configAllowlist = configDefaults?.egressAllowlist ?? []
      const configBlocklist = configDefaults?.egressBlocklist ?? []
      const allowlist = [...new Set([...presetAllowlist, ...configAllowlist])]

      // Persist computed allowlist to store
      store.update(sandboxId, { allowlist })

      // Use sidecar container name as hostname on internal Docker network
      const sidecarHostname = `yologuard-squid-${sandboxId}`
      const proxyEnv = deps.egress
        ? deps.egress.getProxyEnvVars({ sidecarIp: sidecarHostname })
        : {}

      // Create network + sidecar BEFORE the container so it starts directly
      // on the isolated network with Docker DNS configured (hostname resolution works).
      // If egress setup fails, abort — never start a container without the proxy.
      const networkName = `yologuard-${sandboxId}`
      if (deps.egress) {
        logger.info({ sandboxId, networkName }, 'Setting up network isolation...')
        await deps.egress.createSandboxNetwork({ sandboxId, logger })
        await deps.egress.createSidecar({
          sandboxId,
          networkName,
          allowlist,
          blocklist: configBlocklist.length > 0 ? configBlocklist : undefined,
          logger,
        })
        logger.info({ sandboxId }, 'Network + sidecar ready')
      }

      logger.info({ sandboxId }, 'Resolving devcontainer config...')
      const {
        config: baseConfig,
        dockerfile,
        existing,
      } = await deps.resolveDevcontainerConfig({
        workspacePath: repo,
        sandboxId,
        agent: agent as AgentType,
      })

      // Override network to use isolated network with sidecar, inject proxy env vars
      let config = deps.egress
        ? {
            ...baseConfig,
            containerEnv: { ...baseConfig.containerEnv, ...proxyEnv },
            runArgs: baseConfig.runArgs.map((arg, i, arr) =>
              arr[i - 1] === '--network' ? networkName : arg,
            ),
          }
        : { ...baseConfig, runArgs: [...baseConfig.runArgs] }

      // Mount gateway socket into container for agent tool communication
      if (deps.gatewaySocketPath) {
        config = {
          ...config,
          runArgs: [...config.runArgs, '--volume', `${deps.gatewaySocketPath}:${SOCKET_PATH}`],
        }
      }

      // Generated configs go under ~/.yologuard/configs/<sandboxId>/.devcontainer/
      // so the user's repo stays clean. workspaceMount in devcontainer.json mounts
      // the real repo inside the container. --workspace-folder points at the config
      // dir so local features (./security) resolve correctly.
      let configPath: string | undefined
      let workspaceForCli = repo
      if (!existing) {
        const configBase = join(homedir(), '.yologuard', 'configs', sandboxId)
        const configDir = join(configBase, '.devcontainer')
        await mkdir(configDir, { recursive: true })

        if (deps.copySecurityFeature) {
          await deps.copySecurityFeature({ targetDir: configDir })
          logger.info({ sandboxId }, 'Copied security feature into config dir')
        }

        configPath = join(configDir, 'devcontainer.json')
        await writeFile(configPath, JSON.stringify(config, null, '\t'))
        await writeFile(join(configDir, 'Dockerfile'), dockerfile)
        logger.info({ sandboxId, configPath }, 'Wrote generated devcontainer config')

        workspaceForCli = configBase
      } else {
        logger.info({ sandboxId }, 'Using existing .devcontainer/devcontainer.json')
      }

      // Store configPath + remoteUser early so `attach` can use them while `up` is still running
      store.update(sandboxId, { configPath, remoteUser: config.remoteUser })

      logger.info({ sandboxId }, 'Starting devcontainer up...')
      const result = await deps.sandboxManager.createSandbox({
        id: sandboxId,
        workspacePath: workspaceForCli,
        devcontainerConfig: config,
        configPath,
        logger,
      })

      store.update(sandboxId, {
        containerId: result.containerId,
        state: result.state as SandboxState,
        configPath,
      })

      if (agent && deps.launchAgent) {
        logger.info({ sandboxId, agent }, 'Launching agent...')
        await deps.launchAgent({
          workspacePath: workspaceForCli,
          agent: agent as AgentType,
          configPath,
          logger,
        })
      }

      // Start health monitor for idle timeout and unhealthy detection
      if (deps.startHealthMonitor && deps.inspectContainer && result.containerId) {
        deps.startHealthMonitor({
          sandboxId,
          container: { inspect: () => deps.inspectContainer!(result.containerId) },
          idleTimeoutMs: configDefaults?.sandbox.idleTimeoutMs,
          logger,
          onTimeout: async (id) => {
            await deps.destroySandboxById?.(id)
          },
          onUnhealthy: async ({ sandboxId: id }) => {
            await deps.destroySandboxById?.(id)
          },
        })
      }

      logger.info({ sandboxId, containerId: result.containerId }, 'Sandbox created with container')
    } catch (err) {
      logger.error({ sandboxId, err }, 'Failed to create sandbox container')
      store.update(sandboxId, { state: 'stopped' })
    }
  }

  const createSandbox: OperationHandler<'createSandbox', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const body = c.request.requestBody

    const effectiveAgent = body.agent ?? configDefaults?.sandbox.agent
    const effectiveNetworkPolicy =
      body.networkPolicy ?? configDefaults?.sandbox.networkPolicy ?? 'none'

    const sandbox = store.create({
      repo: body.repo,
      agent: effectiveAgent,
      branch: body.branch,
      networkPolicy: effectiveNetworkPolicy,
    })

    // Fire-and-forget: provision in background so the HTTP response returns immediately
    provisionSandbox({
      sandboxId: sandbox.id,
      repo: body.repo,
      agent: effectiveAgent,
      networkPolicy: effectiveNetworkPolicy,
    })

    return replyJSON({ data: sandbox, reply, status: 201 })
  }

  const listSandboxes: OperationHandler<'listSandboxes', FastifyHandlerArgs> = async (
    _c,
    _req,
    reply,
  ) => replyJSON({ data: store.list(), reply, status: 200 })

  const getSandbox: OperationHandler<'getSandbox', FastifyHandlerArgs> = async (c, _req, reply) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }
    return replyJSON({ data: sandbox, reply, status: 200 })
  }

  const deleteSandbox: OperationHandler<'deleteSandbox', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)

    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }

    if (deps.destroySandboxById) {
      await deps.destroySandboxById(sandboxId)
    } else {
      store.remove(sandboxId)
    }

    return replyJSON({ data: { message: `Sandbox ${sandboxId} destroyed` }, reply, status: 200 })
  }

  const listApprovals: OperationHandler<'listApprovals', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }
    const approvals = deps.approvalStore?.listPending(sandboxId) ?? []
    return replyJSON({ data: approvals, reply, status: 200 })
  }

  // Execute side-effects when an approval is granted
  const executeApprovalAction = async ({
    sandboxId,
    requestType,
    payload,
  }: {
    readonly sandboxId: string
    readonly requestType: string
    readonly payload: Record<string, unknown>
  }) => {
    try {
      if (requestType === 'egress.allow' && deps.egress?.updateAllowlist) {
        const domains = (payload.domains as string[]) ?? [payload.domain as string]
        const validDomains = domains.filter(Boolean)
        await deps.egress.updateAllowlist({
          sandboxId,
          allowlist: validDomains,
          logger,
        })
        // Merge new domains into persisted allowlist
        const existingSandbox = store.get(sandboxId)
        if (existingSandbox) {
          const merged = [...new Set([...(existingSandbox.allowlist ?? []), ...validDomains])]
          store.update(sandboxId, { allowlist: merged })
        }
        logger.info({ sandboxId, domains }, 'Egress allowlist updated after approval')
      }

      if (requestType === 'git.push' && deps.approveRemote) {
        const remote = payload.remote as string
        if (remote) {
          deps.approveRemote({ sandboxId, remote })
          logger.info({ sandboxId, remote }, 'Remote approved for push')
        }
      }
    } catch (err) {
      logger.error({ sandboxId, requestType, err }, 'Failed to execute approval action')
    }
  }

  const approveSandboxRequest: OperationHandler<
    'approveSandboxRequest',
    FastifyHandlerArgs
  > = async (c, _req, reply) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }
    const body = c.request.requestBody

    if (deps.approvalStore) {
      try {
        const decision = deps.approvalStore.resolve({
          requestId: body.requestId,
          approved: body.approved,
          scope: body.scope,
          ttlMs: body.ttlMs,
          reason: body.reason,
          approver: 'cli',
        })

        // Notify the blocking socket waiter so the agent tool gets the response
        deps.approvalHandler?.notifyDecision({ requestId: body.requestId, decision })

        // Execute side-effects for approved requests
        if (decision.approved) {
          const request = deps.approvalStore.getRequest(body.requestId)
          if (request) {
            await executeApprovalAction({
              sandboxId,
              requestType: request.type,
              payload: request.payload,
            })
          }
        }

        return replyJSON({ data: decision, reply, status: 200 })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return replyError({ reply, status: 404, error: message })
      }
    }

    return replyJSON({
      data: {
        id: crypto.randomUUID(),
        requestId: body.requestId,
        sandboxId,
        approved: body.approved,
        scope: body.scope,
        ttlMs: body.ttlMs,
        reason: body.reason,
        approver: 'cli',
        decidedAt: new Date().toISOString(),
      },
      reply,
      status: 200,
    })
  }

  const revokeApproval: OperationHandler<'revokeApproval', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }

    const { approvalId } = c.request.params
    if (!deps.approvalStore) {
      return replyError({ reply, status: 404, error: 'Approval not found' })
    }

    const revoked = deps.approvalStore.revoke(approvalId)
    if (!revoked) {
      return replyError({ reply, status: 404, error: 'Approval not found' })
    }

    return replyJSON({ data: { message: `Approval ${approvalId} revoked` }, reply, status: 200 })
  }

  const getEgress: OperationHandler<'getEgress', FastifyHandlerArgs> = async (c, _req, reply) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }
    return replyJSON({
      data: {
        preset: sandbox.networkPolicy ?? 'none',
        allowlist: sandbox.allowlist ? [...sandbox.allowlist] : [],
      },
      reply,
      status: 200,
    })
  }

  const setEgress: OperationHandler<'setEgress', FastifyHandlerArgs> = async (c, _req, reply) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }

    const body = c.request.requestBody
    let newAllowlist: string[]
    let preset = sandbox.networkPolicy ?? 'none'

    if (body.allowlist) {
      newAllowlist = [...new Set(body.allowlist)]
    } else if (body.preset) {
      preset = body.preset
      const presetDomains = deps.egress
        ? deps.egress.getPresetAllowlist(body.preset as PolicyPreset)
        : []
      const additional = body.additionalDomains ?? []
      newAllowlist = [...new Set([...presetDomains, ...additional])]
    } else {
      newAllowlist = sandbox.allowlist ? [...sandbox.allowlist] : []
    }

    if (deps.egress?.updateAllowlist) {
      await deps.egress.updateAllowlist({ sandboxId, allowlist: newAllowlist, logger })
    }
    store.update(sandboxId, { allowlist: newAllowlist, networkPolicy: preset })

    return replyJSON({
      data: { preset, allowlist: newAllowlist },
      reply,
      status: 200,
    })
  }

  const addEgressDomains: OperationHandler<'addEgressDomains', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }

    const body = c.request.requestBody
    const existing = sandbox.allowlist ? [...sandbox.allowlist] : []
    const merged = [...new Set([...existing, ...body.domains])]

    if (deps.egress?.updateAllowlist) {
      await deps.egress.updateAllowlist({ sandboxId, allowlist: merged, logger })
    }
    store.update(sandboxId, { allowlist: merged })

    return replyJSON({
      data: { preset: sandbox.networkPolicy ?? 'none', allowlist: merged },
      reply,
      status: 200,
    })
  }

  const removeEgressDomains: OperationHandler<'removeEgressDomains', FastifyHandlerArgs> = async (
    c,
    _req,
    reply,
  ) => {
    const { sandboxId } = c.request.params
    const sandbox = store.get(sandboxId)
    if (!sandbox) {
      return replyError({ reply, status: 404, error: 'Sandbox not found' })
    }

    const body = c.request.requestBody
    const removeSet = new Set(body.domains)
    const filtered = (sandbox.allowlist ?? []).filter((d) => !removeSet.has(d))

    if (deps.egress?.updateAllowlist) {
      await deps.egress.updateAllowlist({ sandboxId, allowlist: filtered, logger })
    }
    store.update(sandboxId, { allowlist: filtered })

    return replyJSON({
      data: { preset: sandbox.networkPolicy ?? 'none', allowlist: [...filtered] },
      reply,
      status: 200,
    })
  }

  api.register({
    getHealth,
    createSandbox,
    listSandboxes,
    getSandbox,
    deleteSandbox,
    listApprovals,
    approveSandboxRequest,
    revokeApproval,
    getEgress,
    setEgress,
    addEgressDomains,
    removeEgressDomains,

    validationFail: async (c: Context, _req: FastifyRequest, reply: FastifyReply) =>
      replyError({
        reply,
        status: 400,
        error: (c.validation.errors ?? []).map((e) => e.message).join(', '),
      }),

    notFound: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) =>
      replyError({ reply, status: 404, error: 'Not found' }),

    methodNotAllowed: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) =>
      replyError({ reply, status: 405, error: 'Method not allowed' }),
  })
}
