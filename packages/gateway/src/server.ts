import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import {
	createLogger,
	loadConfig,
	SOCKET_PATH,
	type GatewayConfig,
	type Logger,
	DEFAULT_GATEWAY_HOST,
	DEFAULT_GATEWAY_PORT,
} from '@yologuard/shared'
import {
	createSandboxManager,
	resolveDevcontainerConfig,
	launchAgent,
	startHealthMonitor,
	stopHealthMonitor,
	stopAllMonitors,
	type AgentType,
} from '@yologuard/sandbox'
import {
	createSandboxNetwork,
	createSidecar,
	connectToNetwork,
	disconnectFromNetwork,
	destroySidecar,
	destroySandboxNetwork,
	getPresetAllowlist,
	getProxyEnvVars,
	updateAllowlist,
} from '@yologuard/egress'
import { createTokenStore, approveRemote } from '@yologuard/credentials'
import { createOpenApiBackend } from './openapi.js'
import { registerRoutes, type RouteDeps } from './routes/index.js'
import { createSandboxStore } from './store.js'
import { createApprovalStore } from './approvals.js'
import { createApprovalHandler } from './approval-handler.js'
import { createSocketServer } from './socket.js'
import { createDockerClient } from './docker.js'

const ORPHAN_SCAN_INTERVAL_MS = 60_000

export type GatewayOptions = {
	readonly config?: Partial<GatewayConfig>
	readonly enableSandboxManager?: boolean
	readonly stateDir?: string
	readonly socketPath?: string
}

export type Gateway = {
	readonly app: FastifyInstance
	readonly start: () => Promise<FastifyInstance>
	readonly stop: () => Promise<void>
}

export const createGateway = async ({
	config,
	enableSandboxManager = false,
	stateDir,
	socketPath,
}: GatewayOptions = {}): Promise<Gateway> => {
	const userConfig = loadConfig()
	const host = config?.host ?? userConfig.gateway.host
	const port = config?.port ?? userConfig.gateway.port
	const logger = createLogger({ name: 'gateway' })

	const hostSocketPath = socketPath ?? join(homedir(), '.yologuard', 'gateway.sock')

	const app = Fastify({ logger: false })

	// Parse JSON bodies
	app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
		try {
			done(null, JSON.parse(body as string))
		} catch (err) {
			done(err as Error, undefined)
		}
	})

	const sandboxStore = createSandboxStore({ stateDir })

	// Wire up sandbox manager when enabled (requires Docker + devcontainer CLI)
	const sandboxManager = enableSandboxManager
		? createSandboxManager({ logger })
		: undefined

	const dockerClient = enableSandboxManager
		? createDockerClient({ logger })
		: undefined

	const approvalStore = createApprovalStore()
	const tokenStore = createTokenStore({ logger })

	// Load saved credentials from disk
	const credDir = join(homedir(), '.yologuard', 'credentials')
	for (const [file, provider] of [['github-pat', 'github'], ['gitlab-pat', 'gitlab']] as const) {
		try {
			const pat = readFileSync(join(credDir, file), 'utf-8').trim()
			if (pat) {
				tokenStore.addToken({ provider, token: pat })
				logger.info({ provider }, 'Loaded saved credential')
			}
		} catch {
			// No saved credential for this provider
		}
	}

	const approvalHandler = createApprovalHandler({ approvalStore, logger })

	// Socket request router: credential requests get immediate response,
	// approval requests register and then block until a human decides
	const socketServer = createSocketServer({
		socketPath: hostSocketPath,
		logger,
		onRequest: async (request) => {
			if (request.type === 'credential.get') {
				const { protocol, host: reqHost, path: reqPath } = request.payload as {
					protocol: string
					host: string
					path?: string
				}
				const remote = `${protocol}://${reqHost}/${reqPath ?? ''}`
				const cred = tokenStore.issueCredential({
					sandboxId: request.sandboxId,
					remote,
				})
				if (cred) {
					return {
						type: 'credential_response',
						success: true,
						data: { username: 'x-access-token', password: cred.token },
					}
				}
				return {
					type: 'credential_response',
					success: false,
					error: 'Credential denied',
				}
			}

			// Register the approval request synchronously
			const response = approvalHandler.onRequest(JSON.stringify(request))
			if (!response.success) return response

			// Block until a human resolves the request
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

	const egressFns = enableSandboxManager
		? {
				createSandboxNetwork,
				createSidecar,
				connectToNetwork,
				disconnectFromNetwork,
				destroySidecar,
				destroySandboxNetwork,
				getPresetAllowlist,
				getProxyEnvVars,
				updateAllowlist,
			}
		: undefined

	// Full sandbox destroy: container + egress + health monitor + config files + store
	const destroySandboxById = async (sandboxId: string) => {
		const sandbox = sandboxStore.get(sandboxId)
		if (!sandbox) return

		if (sandboxManager && sandbox.repo) {
			try {
				await sandboxManager.destroySandbox({
					id: sandboxId,
					workspacePath: sandbox.repo,
					logger,
				})
			} catch (err) {
				logger.error({ sandboxId, err }, 'Failed to destroy sandbox container')
			}
		}

		if (egressFns) {
			try {
				await egressFns.destroySidecar({ sandboxId, logger })
			} catch (err) {
				logger.warn({ sandboxId, err }, 'Failed to destroy egress sidecar')
			}
			try {
				await egressFns.destroySandboxNetwork({ sandboxId, logger })
			} catch (err) {
				logger.warn({ sandboxId, err }, 'Failed to destroy sandbox network')
			}
		}

		stopHealthMonitor(sandboxId)

		if (sandbox.configPath) {
			try {
				await rm(dirname(sandbox.configPath), { recursive: true, force: true })
			} catch {
				// config dir may already be gone
			}
		}

		sandboxStore.remove(sandboxId)
		logger.info({ sandboxId }, 'Sandbox fully destroyed')
	}

	const inspectContainer = dockerClient
		? async (containerId: string) => {
				const info = await dockerClient.inspectContainer(containerId)
				return {
					State: {
						Running: info.State.Running,
						OOMKilled: info.State.OOMKilled,
						Status: info.State.Status,
					},
				}
			}
		: undefined

	const deps: RouteDeps = {
		store: sandboxStore,
		logger,
		approvalStore,
		approvalHandler,
		tokenStore,
		sandboxManager,
		egress: egressFns,
		destroySandboxById,
		inspectContainer,
		resolveDevcontainerConfig,
		launchAgent,
		startHealthMonitor,
		stopHealthMonitor,
		userConfig,
		gatewaySocketPath: hostSocketPath,
	}

	const api = await createOpenApiBackend()
	registerRoutes({ api, deps })

	app.all('/*', async (request, reply) => {
		const response = await api.handleRequest(
			{
				method: request.method,
				path: request.url,
				headers: request.headers as Record<string, string>,
				body: request.body,
				query: request.query as Record<string, string>,
			},
			request,
			reply,
		)
		return response
	})

	// Reconcile persisted state with Docker, restart health monitors for running sandboxes
	const reconcileState = async () => {
		if (!sandboxManager) return

		const allSandboxes = sandboxStore.list()
		for (const sandbox of allSandboxes) {
			if (sandbox.containerId && sandbox.containerId !== 'unknown') {
				const state = await sandboxManager.getSandboxStatus({ containerId: sandbox.containerId })
				if (state === 'stopped') {
					sandboxStore.remove(sandbox.id)
					logger.info({ sandboxId: sandbox.id }, 'Removed stale sandbox record')
				} else {
					sandboxStore.update(sandbox.id, { state })

					// Restart health monitor for recovered running sandboxes
					if (state === 'running' && inspectContainer) {
						const containerId = sandbox.containerId
						startHealthMonitor({
							sandboxId: sandbox.id,
							container: { inspect: () => inspectContainer(containerId) },
							idleTimeoutMs: userConfig.sandbox.idleTimeoutMs,
							logger,
							onTimeout: async (id) => { await destroySandboxById(id) },
							onUnhealthy: async ({ sandboxId: id }) => { await destroySandboxById(id) },
						})
					}
				}
			} else if (sandbox.state === 'creating') {
				sandboxStore.remove(sandbox.id)
				logger.info({ sandboxId: sandbox.id }, 'Removed orphaned sandbox record')
			}
		}
	}

	// Scan Docker for orphaned yologuard containers not in the store
	const scanOrphanContainers = async () => {
		if (!dockerClient) return

		try {
			const containers = await dockerClient.listContainers()
			const knownContainerIds = new Set(
				sandboxStore.list()
					.map((s) => s.containerId)
					.filter(Boolean),
			)

			for (const container of containers) {
				const shortId = container.Id.slice(0, 12)
				if (!knownContainerIds.has(shortId) && !knownContainerIds.has(container.Id)) {
					logger.info({ containerId: container.Id, names: container.Names }, 'Removing orphaned container')
					try {
						await dockerClient.removeContainer(container.Id)
					} catch (err) {
						logger.warn({ containerId: container.Id, err }, 'Failed to remove orphaned container')
					}
				}
			}
		} catch (err) {
			logger.warn({ err }, 'Orphan container scan failed')
		}
	}

	let orphanScanInterval: ReturnType<typeof setInterval> | undefined

	const start = async () => {
		await socketServer.start()
		await reconcileState()
		await scanOrphanContainers()

		if (dockerClient) {
			orphanScanInterval = setInterval(() => {
				scanOrphanContainers()
			}, ORPHAN_SCAN_INTERVAL_MS)
			orphanScanInterval.unref()
		}

		await app.listen({ host, port })
		logger.info({ host, port, socketPath: hostSocketPath }, 'Gateway started')
		return app
	}

	const stop = async () => {
		logger.info('Gateway shutting down')

		if (orphanScanInterval) {
			clearInterval(orphanScanInterval)
			orphanScanInterval = undefined
		}

		stopAllMonitors()

		// Destroy all active sandboxes
		const allSandboxes = sandboxStore.list()
		for (const sandbox of allSandboxes) {
			if (sandbox.state === 'running' || sandbox.state === 'creating') {
				await destroySandboxById(sandbox.id)
			}
		}

		await socketServer.stop()
		await app.close()
	}

	return { app, start, stop }
}
