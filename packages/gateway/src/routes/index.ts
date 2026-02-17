import type { OpenAPIBackend, Context } from 'openapi-backend'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { YOLOGUARD_VERSION, type Logger, type SandboxState } from '@yologuard/shared'
import type {
	AgentType,
	DevcontainerConfig,
} from '@yologuard/sandbox'
import type { ApprovalStore } from '../approvals.js'
import type {
	OperationHandler,
	HandlerResponse,
	ErrorResponse,
} from '../types/openapi.d.ts'

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
}): HandlerResponse<ErrorResponse> =>
	replyJSON({ data: { status, error }, reply, status })

type SandboxRecord = {
	readonly id: string
	readonly repo: string
	readonly agent: string
	readonly branch?: string
	readonly state: SandboxState
	readonly createdAt: string
	readonly containerId?: string
	readonly networkPolicy?: string
}

type SandboxStore = {
	readonly create: (params: {
		readonly repo: string
		readonly agent: string
		readonly branch?: string
		readonly networkPolicy?: string
	}) => SandboxRecord
	readonly get: (id: string) => SandboxRecord | undefined
	readonly list: () => SandboxRecord[]
	readonly remove: (id: string) => boolean
	readonly update: (
		id: string,
		updates: Partial<SandboxRecord>,
	) => SandboxRecord | undefined
}

type SandboxManager = {
	readonly createSandbox: (params: {
		readonly id: string
		readonly workspacePath: string
		readonly devcontainerConfig: DevcontainerConfig
		readonly resourceLimits?: { cpus?: number; memoryMb?: number; diskMb?: number }
		readonly logger: Logger
	}) => Promise<{ containerId: string; state: string }>
	readonly destroySandbox: (params: {
		readonly id: string
		readonly workspacePath: string
		readonly logger: Logger
	}) => Promise<void>
}

export type RouteDeps = {
	readonly store: SandboxStore
	readonly logger: Logger
	readonly approvalStore?: ApprovalStore
	readonly sandboxManager?: SandboxManager
	readonly resolveDevcontainerConfig?: (params: {
		readonly workspacePath: string
		readonly sandboxId: string
		readonly resourceLimits?: { cpus?: number; memoryMb?: number; diskMb?: number }
	}) => Promise<{ config: DevcontainerConfig; existing: boolean }>
	readonly launchAgent?: (params: {
		readonly workspacePath: string
		readonly agent: AgentType
		readonly prompt?: string
		readonly logger: Logger
	}) => Promise<void>
	readonly startHealthMonitor?: (params: {
		readonly sandboxId: string
		readonly container: { inspect: () => Promise<{ State: { Running: boolean; OOMKilled: boolean; Status: string } }> }
		readonly idleTimeoutMs?: number
		readonly logger: Logger
		readonly onTimeout: (sandboxId: string) => void | Promise<void>
		readonly onUnhealthy: (params: { sandboxId: string; reason: string }) => void | Promise<void>
	}) => void
	readonly stopHealthMonitor?: (sandboxId: string) => void
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

	const createSandbox: OperationHandler<'createSandbox', FastifyHandlerArgs> = async (c, _req, reply) => {
		const body = c.request.requestBody

		const sandbox = store.create({
			repo: body.repo,
			agent: body.agent ?? 'claude',
			branch: body.branch,
			networkPolicy: body.networkPolicy ?? 'none',
		})

		if (deps.sandboxManager && deps.resolveDevcontainerConfig) {
			try {
				const { config } = await deps.resolveDevcontainerConfig({
					workspacePath: body.repo,
					sandboxId: sandbox.id,
				})

				const result = await deps.sandboxManager.createSandbox({
					id: sandbox.id,
					workspacePath: body.repo,
					devcontainerConfig: config,
					logger,
				})

				store.update(sandbox.id, {
					containerId: result.containerId,
					state: result.state as SandboxState,
				})

				if (deps.launchAgent) {
					await deps.launchAgent({
						workspacePath: body.repo,
						agent: (body.agent ?? 'claude') as AgentType,
						logger,
					})
				}

				logger.info({ sandboxId: sandbox.id, containerId: result.containerId }, 'Sandbox created with container')
			} catch (err) {
				logger.error({ sandboxId: sandbox.id, err }, 'Failed to create sandbox container')
				store.update(sandbox.id, { state: 'stopped' })
			}
		}

		const updated = store.get(sandbox.id) ?? sandbox
		return replyJSON({ data: updated, reply, status: 201 })
	}

	const listSandboxes: OperationHandler<'listSandboxes', FastifyHandlerArgs> = async (_c, _req, reply) =>
		replyJSON({ data: store.list(), reply, status: 200 })

	const getSandbox: OperationHandler<'getSandbox', FastifyHandlerArgs> = async (c, _req, reply) => {
		const { sandboxId } = c.request.params
		const sandbox = store.get(sandboxId)
		if (!sandbox) {
			return replyError({ reply, status: 404, error: 'Sandbox not found' })
		}
		return replyJSON({ data: sandbox, reply, status: 200 })
	}

	const deleteSandbox: OperationHandler<'deleteSandbox', FastifyHandlerArgs> = async (c, _req, reply) => {
		const { sandboxId } = c.request.params
		const sandbox = store.get(sandboxId)

		if (!sandbox) {
			return replyError({ reply, status: 404, error: 'Sandbox not found' })
		}

		if (deps.sandboxManager) {
			try {
				const repo = sandbox.repo
				await deps.sandboxManager.destroySandbox({
					id: sandboxId,
					workspacePath: repo,
					logger,
				})
			} catch (err) {
				logger.error({ sandboxId, err }, 'Failed to destroy sandbox container')
			}
		}

		deps.stopHealthMonitor?.(sandboxId)
		store.remove(sandboxId)
		return replyJSON({ data: { message: `Sandbox ${sandboxId} destroyed` }, reply, status: 200 })
	}

	const listApprovals: OperationHandler<'listApprovals', FastifyHandlerArgs> = async (c, _req, reply) => {
		const { sandboxId } = c.request.params
		const sandbox = store.get(sandboxId)
		if (!sandbox) {
			return replyError({ reply, status: 404, error: 'Sandbox not found' })
		}
		const approvals = deps.approvalStore?.listPending(sandboxId) ?? []
		return replyJSON({ data: approvals, reply, status: 200 })
	}

	const approveSandboxRequest: OperationHandler<'approveSandboxRequest', FastifyHandlerArgs> = async (c, _req, reply) => {
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

	const revokeApproval: OperationHandler<'revokeApproval', FastifyHandlerArgs> = async (c, _req, reply) => {
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

	api.register({
		getHealth,
		createSandbox,
		listSandboxes,
		getSandbox,
		deleteSandbox,
		listApprovals,
		approveSandboxRequest,
		revokeApproval,

		validationFail: async (c: Context, _req: FastifyRequest, reply: FastifyReply) =>
			replyError({ reply, status: 400, error: (c.validation.errors ?? []).map((e) => e.message).join(', ') }),

		notFound: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) =>
			replyError({ reply, status: 404, error: 'Not found' }),

		methodNotAllowed: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) =>
			replyError({ reply, status: 405, error: 'Method not allowed' }),
	})
}
