import Fastify, { type FastifyInstance } from 'fastify'
import {
	createLogger,
	type GatewayConfig,
	DEFAULT_GATEWAY_HOST,
	DEFAULT_GATEWAY_PORT,
} from '@yologuard/shared'
import { createOpenApiBackend } from './openapi.js'
import { registerRoutes } from './routes/index.js'

export type GatewayOptions = {
	readonly config?: Partial<GatewayConfig>
}

export type Gateway = {
	readonly app: FastifyInstance
	readonly start: () => Promise<FastifyInstance>
	readonly stop: () => Promise<void>
}

export const createGateway = async ({ config }: GatewayOptions = {}): Promise<Gateway> => {
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

	const api = await createOpenApiBackend()
	registerRoutes(api)

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
		await app.close()
	}

	return { app, start, stop }
}
