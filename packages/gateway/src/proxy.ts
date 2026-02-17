import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Logger } from '@yologuard/shared'

const MODEL_PROVIDERS = {
	anthropic: {
		baseUrl: 'https://api.anthropic.com',
		headerPrefix: 'x-api-key',
	},
	openai: {
		baseUrl: 'https://api.openai.com',
		headerPrefix: 'authorization',
	},
} as const satisfies Record<string, { baseUrl: string; headerPrefix: string }>

type ModelProvider = keyof typeof MODEL_PROVIDERS

type RegisterModelProxyParams = {
	readonly app: FastifyInstance
	readonly logger: Logger
	readonly getApiKey?: (params: {
		readonly provider: ModelProvider
		readonly sandboxId?: string
	}) => string | undefined
}

export const registerModelProxy = ({
	app,
	logger,
	getApiKey,
}: RegisterModelProxyParams) => {
	// Proxy route: /v1/* → forward to model provider
	// The sandbox calls http://gateway:4200/v1/messages (Anthropic)
	// or http://gateway:4200/v1/chat/completions (OpenAI)
	app.all('/v1/*', async (request: FastifyRequest, reply: FastifyReply) => {
		const path = request.url
		const sandboxId = (request.headers['x-yologuard-sandbox-id'] as string) ?? undefined

		// Determine provider from the path
		const provider = detectProvider(path)
		if (!provider) {
			return reply.status(400).send({
				status: 400,
				error: 'Unknown model API path. Supported: /v1/messages (Anthropic), /v1/chat/completions (OpenAI)',
			})
		}

		const providerConfig = MODEL_PROVIDERS[provider]

		// Get API key — either from gateway config or pass-through from sandbox header
		const apiKey = getApiKey?.({ provider, sandboxId })
			?? (request.headers[providerConfig.headerPrefix] as string)

		if (!apiKey) {
			return reply.status(401).send({
				status: 401,
				error: `No API key configured for ${provider}. Set it in ~/.yologuard/yologuard.json or pass via header.`,
			})
		}

		const targetUrl = `${providerConfig.baseUrl}${path}`

		logger.info({ provider, path, sandboxId }, 'Proxying model API request')

		try {
			const headers: Record<string, string> = {
				'content-type': request.headers['content-type'] ?? 'application/json',
			}

			// Set provider-specific auth header
			if (provider === 'anthropic') {
				headers['x-api-key'] = apiKey
				headers['anthropic-version'] = (request.headers['anthropic-version'] as string) ?? '2023-06-01'
			} else {
				headers['authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
			}

			const response = await fetch(targetUrl, {
				method: request.method,
				headers,
				body: request.method !== 'GET' ? JSON.stringify(request.body) : undefined,
			})

			const responseBody = await response.text()

			// Forward the response
			return reply
				.status(response.status)
				.header('content-type', response.headers.get('content-type') ?? 'application/json')
				.send(responseBody)
		} catch (err) {
			logger.error({ provider, path, err }, 'Model API proxy error')
			return reply.status(502).send({
				status: 502,
				error: `Failed to proxy to ${provider}: ${err instanceof Error ? err.message : 'Unknown error'}`,
			})
		}
	})
}

const detectProvider = (path: string): ModelProvider | undefined => {
	// Anthropic paths: /v1/messages, /v1/complete
	if (path.includes('/messages') || path.includes('/complete')) {
		return 'anthropic'
	}
	// OpenAI paths: /v1/chat/completions, /v1/completions, /v1/embeddings
	if (path.includes('/chat/') || path.includes('/completions') || path.includes('/embeddings')) {
		return 'openai'
	}
	return undefined
}
