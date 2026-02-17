import Fastify from 'fastify'
import { registerModelProxy } from './proxy.js'

const createTestApp = ({
	getApiKey,
}: { getApiKey?: Parameters<typeof registerModelProxy>[0]['getApiKey'] } = {}) => {
	const app = Fastify({ logger: false })

	app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
		try {
			done(null, JSON.parse(body as string))
		} catch (err) {
			done(err as Error, undefined)
		}
	})

	const mockLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		fatal: vi.fn(),
		trace: vi.fn(),
		child: vi.fn(),
		level: 'info',
		silent: vi.fn(),
	} as never

	registerModelProxy({ app, logger: mockLogger, getApiKey })
	return app
}

describe('model API proxy', () => {
	it('returns 400 for unknown paths', async () => {
		const app = createTestApp()

		const response = await app.inject({
			method: 'POST',
			url: '/v1/unknown-endpoint',
			payload: {},
		})

		expect(response.statusCode).toBe(400)
		expect(JSON.parse(response.body).error).toContain('Unknown model API path')
	})

	it('returns 401 when no API key is available', async () => {
		const app = createTestApp({
			getApiKey: () => undefined,
		})

		const response = await app.inject({
			method: 'POST',
			url: '/v1/messages',
			payload: { model: 'claude-3', messages: [] },
		})

		expect(response.statusCode).toBe(401)
		expect(JSON.parse(response.body).error).toContain('No API key configured')
	})

	it('detects Anthropic from /v1/messages path', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ content: 'hello' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		)

		const app = createTestApp({
			getApiKey: ({ provider }) => provider === 'anthropic' ? 'test-key' : undefined,
		})

		const response = await app.inject({
			method: 'POST',
			url: '/v1/messages',
			payload: { model: 'claude-3', messages: [] },
		})

		expect(response.statusCode).toBe(200)
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://api.anthropic.com/v1/messages',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'x-api-key': 'test-key',
				}),
			}),
		)

		fetchSpy.mockRestore()
	})

	it('detects OpenAI from /v1/chat/completions path', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ choices: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		)

		const app = createTestApp({
			getApiKey: ({ provider }) => provider === 'openai' ? 'sk-test' : undefined,
		})

		const response = await app.inject({
			method: 'POST',
			url: '/v1/chat/completions',
			payload: { model: 'gpt-4', messages: [] },
		})

		expect(response.statusCode).toBe(200)
		expect(fetchSpy).toHaveBeenCalledWith(
			'https://api.openai.com/v1/chat/completions',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer sk-test',
				}),
			}),
		)

		fetchSpy.mockRestore()
	})

	it('returns 502 on upstream failure', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
			new Error('Connection refused'),
		)

		const app = createTestApp({
			getApiKey: () => 'test-key',
		})

		const response = await app.inject({
			method: 'POST',
			url: '/v1/messages',
			payload: {},
		})

		expect(response.statusCode).toBe(502)
		expect(JSON.parse(response.body).error).toContain('Connection refused')

		fetchSpy.mockRestore()
	})
})
