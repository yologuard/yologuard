import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSocketServer } from './socket.js'

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

let socketCounter = 0
const getTestSocketPath = () =>
	join(tmpdir(), `yg-${process.pid}-${++socketCounter}.sock`)

describe('unix socket server', () => {
	let socketPath: string

	beforeEach(() => {
		vi.clearAllMocks()
		socketPath = getTestSocketPath()
	})

	afterEach(async () => {
		// Cleanup is handled by server.stop()
	})

	it('starts and stops cleanly', async () => {
		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest: async () => ({ type: 'ok', success: true }),
		})

		await server.start()
		expect(existsSync(socketPath)).toBe(true)

		await server.stop()
	})

	it('handles JSON requests over the socket', async () => {
		const onRequest = vi.fn().mockResolvedValue({
			type: 'response',
			success: true,
			data: { approved: true },
		})

		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest,
		})

		await server.start()

		const response = await new Promise<string>((resolve, reject) => {
			const client = createConnection(socketPath, () => {
				const request = {
					type: 'egress.allow',
					sandboxId: 'test-sandbox',
					payload: { domain: 'api.stripe.com' },
				}
				client.write(JSON.stringify(request) + '\n')
			})

			let data = ''
			client.on('data', (chunk) => {
				data += chunk.toString()
				if (data.includes('\n')) {
					client.end()
					resolve(data.trim())
				}
			})

			client.on('error', reject)
		})

		const parsed = JSON.parse(response)
		expect(parsed.success).toBe(true)
		expect(parsed.data.approved).toBe(true)
		expect(onRequest).toHaveBeenCalledWith({
			type: 'egress.allow',
			sandboxId: 'test-sandbox',
			payload: { domain: 'api.stripe.com' },
		})

		await server.stop()
	})

	it('handles invalid JSON gracefully', async () => {
		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest: async () => ({ type: 'ok', success: true }),
		})

		await server.start()

		const response = await new Promise<string>((resolve, reject) => {
			const client = createConnection(socketPath, () => {
				client.write('not valid json\n')
			})

			let data = ''
			client.on('data', (chunk) => {
				data += chunk.toString()
				if (data.includes('\n')) {
					client.end()
					resolve(data.trim())
				}
			})

			client.on('error', reject)
		})

		const parsed = JSON.parse(response)
		expect(parsed.success).toBe(false)
		expect(parsed.error).toBe('Invalid JSON')

		await server.stop()
	})

	it('handles handler errors gracefully', async () => {
		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest: async () => {
				throw new Error('Handler crashed')
			},
		})

		await server.start()

		const response = await new Promise<string>((resolve, reject) => {
			const client = createConnection(socketPath, () => {
				client.write(
					JSON.stringify({ type: 'test', sandboxId: 's1', payload: {} }) + '\n',
				)
			})

			let data = ''
			client.on('data', (chunk) => {
				data += chunk.toString()
				if (data.includes('\n')) {
					client.end()
					resolve(data.trim())
				}
			})

			client.on('error', reject)
		})

		const parsed = JSON.parse(response)
		expect(parsed.success).toBe(false)
		expect(parsed.error).toBe('Handler crashed')

		await server.stop()
	})

	it('cleans up stale socket file on start', async () => {
		const { writeFileSync, mkdirSync } = await import('node:fs')
		const { dirname } = await import('node:path')

		mkdirSync(dirname(socketPath), { recursive: true })
		writeFileSync(socketPath, '')

		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest: async () => ({ type: 'ok', success: true }),
		})

		// Should not throw
		await server.start()
		await server.stop()
	})

	it('stop is idempotent', async () => {
		const server = createSocketServer({
			socketPath,
			logger: mockLogger,
			onRequest: async () => ({ type: 'ok', success: true }),
		})

		// Stop without starting should not throw
		await server.stop()
	})
})
