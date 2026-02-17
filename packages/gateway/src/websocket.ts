import type { FastifyInstance } from 'fastify'
import type { Logger } from '@yologuard/shared'

type WebSocketClient = {
	readonly id: string
	readonly sandboxId?: string
	readonly ws: {
		send: (data: string) => void
		close: () => void
		on: (event: string, handler: (...args: unknown[]) => void) => void
		readyState: number
	}
}

type GatewayEvent = {
	readonly type: string
	readonly sandboxId?: string
	readonly data: Record<string, unknown>
	readonly timestamp: string
}

const clients = new Map<string, WebSocketClient>()

export const broadcastEvent = (event: GatewayEvent): void => {
	const message = JSON.stringify(event)
	for (const [, client] of clients) {
		// Only send to clients subscribed to this sandbox (or all if no filter)
		if (!client.sandboxId || client.sandboxId === event.sandboxId) {
			try {
				client.ws.send(message)
			} catch {
				// Client disconnected, will be cleaned up
			}
		}
	}
}

export const getConnectedClients = (): number => clients.size

export const registerWebSocket = async ({
	app,
	logger,
}: {
	readonly app: FastifyInstance
	readonly logger: Logger
}): Promise<void> => {
	await app.register(import('@fastify/websocket'))

	app.get('/ws', { websocket: true }, (socket, request) => {
		const clientId = crypto.randomUUID()
		const sandboxId = (request.query as Record<string, string>)?.sandboxId

		const client: WebSocketClient = {
			id: clientId,
			sandboxId,
			ws: socket,
		}

		clients.set(clientId, client)
		logger.info({ clientId, sandboxId }, 'WebSocket client connected')

		socket.on('message', (rawMessage: unknown) => {
			try {
				const message = JSON.parse(String(rawMessage)) as { type: string }
				logger.debug({ clientId, type: message.type }, 'WebSocket message received')

				// Handle ping/pong for keepalive
				if (message.type === 'ping') {
					socket.send(JSON.stringify({ type: 'pong' }))
				}
			} catch {
				logger.warn({ clientId }, 'Invalid WebSocket message')
			}
		})

		socket.on('close', () => {
			clients.delete(clientId)
			logger.info({ clientId }, 'WebSocket client disconnected')
		})

		socket.on('error', (err: unknown) => {
			logger.error({ clientId, err }, 'WebSocket error')
			clients.delete(clientId)
		})

		// Send welcome message
		socket.send(
			JSON.stringify({
				type: 'connected',
				clientId,
				timestamp: new Date().toISOString(),
			}),
		)
	})
}
