import Fastify, { type FastifyInstance } from 'fastify'
import {
	createLogger,
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
import { createOpenApiBackend } from './openapi.js'
import { registerRoutes, type RouteDeps } from './routes/index.js'
import { sandboxStore } from './store.js'
import { createApprovalStore } from './approvals.js'

export type GatewayOptions = {
	readonly config?: Partial<GatewayConfig>
	readonly enableSandboxManager?: boolean
}

export type Gateway = {
	readonly app: FastifyInstance
	readonly start: () => Promise<FastifyInstance>
	readonly stop: () => Promise<void>
}

export const createGateway = async ({
	config,
	enableSandboxManager = false,
}: GatewayOptions = {}): Promise<Gateway> => {
	const host = config?.host ?? DEFAULT_GATEWAY_HOST
	const port = config?.port ?? DEFAULT_GATEWAY_PORT
	const logger = createLogger({ name: 'gateway' })

	const app = Fastify({ logger: false })

	// Parse JSON bodies
	app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
		try {
			done(null, JSON.parse(body as string))
		} catch (err) {
			done(err as Error, undefined)
		}
	})

	// Wire up sandbox manager when enabled (requires Docker + devcontainer CLI)
	const sandboxManager = enableSandboxManager
		? createSandboxManager({ logger })
		: undefined

	const approvalStore = createApprovalStore()

	const deps: RouteDeps = {
		store: sandboxStore,
		logger,
		approvalStore,
		sandboxManager,
		resolveDevcontainerConfig,
		launchAgent,
		startHealthMonitor,
		stopHealthMonitor,
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

	const start = async () => {
		await app.listen({ host, port })
		logger.info({ host, port }, 'Gateway started')
		return app
	}

	const stop = async () => {
		logger.info('Gateway shutting down')
		stopAllMonitors()
		await app.close()
	}

	return { app, start, stop }
}
