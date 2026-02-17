import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listSandboxes, createSandbox, getSandbox, deleteSandbox, getHealth } from './gateway-client.js'

const mockFetch = vi.fn()

vi.mock('@yologuard/shared', () => ({
	DEFAULT_GATEWAY_URL: 'http://127.0.0.1:4200',
	loadConfig: () => ({
		gateway: { host: '127.0.0.1', port: 4200 },
	}),
}))

beforeEach(() => {
	globalThis.fetch = mockFetch
})

afterEach(() => {
	vi.restoreAllMocks()
})

const mockResponse = ({ status, body }: { readonly status: number; readonly body: unknown }) => {
	mockFetch.mockResolvedValueOnce({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		json: () => Promise.resolve(body),
	})
}

describe('gateway-client', () => {
	describe('getHealth', () => {
		it('should return health status', async () => {
			const healthBody = { status: 'ok', version: '0.0.1', uptime: 42 }
			mockResponse({ status: 200, body: healthBody })

			const result = await getHealth()

			expect(result).toEqual(healthBody)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://127.0.0.1:4200/health',
				expect.objectContaining({ method: 'GET' }),
			)
		})

		it('should throw on gateway error', async () => {
			mockResponse({ status: 503, body: { status: 503, error: 'Service unavailable' } })

			await expect(getHealth()).rejects.toThrow('Gateway error (503): Service unavailable')
		})
	})

	describe('listSandboxes', () => {
		it('should return sandbox list', async () => {
			const sandboxes = [
				{ id: 'abc-123', repo: '/tmp/repo', agent: 'claude', state: 'running' },
			]
			mockResponse({ status: 200, body: sandboxes })

			const result = await listSandboxes()

			expect(result).toEqual(sandboxes)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://127.0.0.1:4200/sandboxes',
				expect.objectContaining({ method: 'GET' }),
			)
		})

		it('should return empty array', async () => {
			mockResponse({ status: 200, body: [] })

			const result = await listSandboxes()

			expect(result).toEqual([])
		})
	})

	describe('createSandbox', () => {
		it('should create a sandbox', async () => {
			const sandbox = {
				id: 'new-123',
				repo: '/tmp/my-repo',
				agent: 'claude',
				state: 'creating',
				createdAt: '2026-02-17T00:00:00.000Z',
			}
			mockResponse({ status: 201, body: sandbox })

			const result = await createSandbox({ repo: '/tmp/my-repo', agent: 'claude' })

			expect(result).toEqual(sandbox)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://127.0.0.1:4200/sandboxes',
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ repo: '/tmp/my-repo', agent: 'claude' }),
				}),
			)
		})

		it('should create a sandbox without optional params', async () => {
			const sandbox = {
				id: 'new-456',
				repo: '.',
				agent: 'claude',
				state: 'creating',
				createdAt: '2026-02-17T00:00:00.000Z',
			}
			mockResponse({ status: 201, body: sandbox })

			const result = await createSandbox({ repo: '.' })

			expect(result).toEqual(sandbox)
		})

		it('should throw on validation error', async () => {
			mockResponse({ status: 400, body: { status: 400, error: 'repo is required' } })

			await expect(createSandbox({ repo: '' })).rejects.toThrow('Gateway error (400): repo is required')
		})
	})

	describe('getSandbox', () => {
		it('should return a sandbox by id', async () => {
			const sandbox = { id: 'abc-123', repo: '/tmp/repo', agent: 'claude', state: 'running' }
			mockResponse({ status: 200, body: sandbox })

			const result = await getSandbox('abc-123')

			expect(result).toEqual(sandbox)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://127.0.0.1:4200/sandboxes/abc-123',
				expect.objectContaining({ method: 'GET' }),
			)
		})

		it('should throw on 404', async () => {
			mockResponse({ status: 404, body: { status: 404, error: 'Sandbox not found' } })

			await expect(getSandbox('nonexistent')).rejects.toThrow('Gateway error (404): Sandbox not found')
		})
	})

	describe('deleteSandbox', () => {
		it('should delete a sandbox', async () => {
			const response = { message: 'Sandbox abc-123 destroyed' }
			mockResponse({ status: 200, body: response })

			const result = await deleteSandbox('abc-123')

			expect(result).toEqual(response)
			expect(mockFetch).toHaveBeenCalledWith(
				'http://127.0.0.1:4200/sandboxes/abc-123',
				expect.objectContaining({ method: 'DELETE' }),
			)
		})

		it('should throw on 404', async () => {
			mockResponse({ status: 404, body: { status: 404, error: 'Sandbox not found' } })

			await expect(deleteSandbox('nonexistent')).rejects.toThrow('Gateway error (404): Sandbox not found')
		})
	})
})
