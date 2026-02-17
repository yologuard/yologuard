import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createGateway } from './server.js'

describe('Gateway server', () => {
	let gateway: Awaited<ReturnType<typeof createGateway>>

	beforeAll(async () => {
		gateway = await createGateway({ config: { host: '127.0.0.1', port: 0 } })
	})

	afterAll(async () => {
		await gateway.stop()
	})

	describe('GET /health', () => {
		it('should return health status', async () => {
			const response = await gateway.app.inject({
				method: 'GET',
				url: '/health',
			})
			const body = JSON.parse(response.body)

			expect(response.statusCode).toBe(200)
			expect(body.status).toBe('ok')
			expect(body.version).toBeDefined()
			expect(body.uptime).toBeGreaterThanOrEqual(0)
		})
	})

	describe('POST /sandboxes', () => {
		it('should create a sandbox', async () => {
			const response = await gateway.app.inject({
				method: 'POST',
				url: '/sandboxes',
				payload: { repo: '/tmp/test-repo', agent: 'claude' },
			})
			const body = JSON.parse(response.body)

			expect(response.statusCode).toBe(201)
			expect(body.id).toBeDefined()
			expect(body.repo).toBe('/tmp/test-repo')
			expect(body.agent).toBe('claude')
			expect(body.state).toBe('creating')
		})

		it('should return 400 for invalid request', async () => {
			const response = await gateway.app.inject({
				method: 'POST',
				url: '/sandboxes',
				payload: {},
			})

			expect(response.statusCode).toBe(400)
		})
	})

	describe('GET /sandboxes', () => {
		it('should list sandboxes', async () => {
			const response = await gateway.app.inject({
				method: 'GET',
				url: '/sandboxes',
			})
			const body = JSON.parse(response.body)

			expect(response.statusCode).toBe(200)
			expect(Array.isArray(body)).toBe(true)
		})
	})

	describe('GET /sandboxes/:sandboxId', () => {
		it('should return 404 for nonexistent sandbox', async () => {
			const response = await gateway.app.inject({
				method: 'GET',
				url: '/sandboxes/nonexistent-id',
			})

			expect(response.statusCode).toBe(404)
		})

		it('should return sandbox by id', async () => {
			// Given: a sandbox exists
			const createRes = await gateway.app.inject({
				method: 'POST',
				url: '/sandboxes',
				payload: { repo: '/tmp/repo' },
			})
			const created = JSON.parse(createRes.body)

			// When: we fetch it by id
			const response = await gateway.app.inject({
				method: 'GET',
				url: `/sandboxes/${created.id}`,
			})
			const body = JSON.parse(response.body)

			// Then: it matches
			expect(response.statusCode).toBe(200)
			expect(body.id).toBe(created.id)
		})
	})

	describe('DELETE /sandboxes/:sandboxId', () => {
		it('should destroy a sandbox', async () => {
			// Given: a sandbox exists
			const createRes = await gateway.app.inject({
				method: 'POST',
				url: '/sandboxes',
				payload: { repo: '/tmp/repo' },
			})
			const created = JSON.parse(createRes.body)

			// When: we delete it
			const deleteRes = await gateway.app.inject({
				method: 'DELETE',
				url: `/sandboxes/${created.id}`,
			})

			// Then: it's gone
			expect(deleteRes.statusCode).toBe(200)

			const getRes = await gateway.app.inject({
				method: 'GET',
				url: `/sandboxes/${created.id}`,
			})
			expect(getRes.statusCode).toBe(404)
		})
	})

	describe('not found', () => {
		it('should return 404 for unknown routes', async () => {
			const response = await gateway.app.inject({
				method: 'GET',
				url: '/nonexistent',
			})

			expect(response.statusCode).toBe(404)
		})
	})
})
