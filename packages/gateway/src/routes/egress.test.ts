import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGateway } from '../server.js'

describe('Egress routes', () => {
	let gateway: Awaited<ReturnType<typeof createGateway>>
	let stateDir: string

	beforeAll(async () => {
		stateDir = mkdtempSync(join(tmpdir(), 'yologuard-egress-test-'))
		gateway = await createGateway({ config: { host: '127.0.0.1', port: 0 }, stateDir })
	})

	afterAll(async () => {
		await gateway.stop()
		rmSync(stateDir, { recursive: true, force: true })
	})

	const createTestSandbox = async () => {
		const res = await gateway.app.inject({
			method: 'POST',
			url: '/sandboxes',
			payload: { repo: '/tmp/egress-test', networkPolicy: 'none' },
		})
		return JSON.parse(res.body) as { id: string }
	}

	describe('GET /sandboxes/:sandboxId/egress', () => {
		it('should return 404 for nonexistent sandbox', async () => {
			const res = await gateway.app.inject({
				method: 'GET',
				url: '/sandboxes/nonexistent/egress',
			})
			expect(res.statusCode).toBe(404)
		})

		it('should return egress config with defaults', async () => {
			const sandbox = await createTestSandbox()
			const res = await gateway.app.inject({
				method: 'GET',
				url: `/sandboxes/${sandbox.id}/egress`,
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.preset).toBe('none')
			expect(body.allowlist).toEqual([])
		})
	})

	describe('PUT /sandboxes/:sandboxId/egress', () => {
		it('should return 404 for nonexistent sandbox', async () => {
			const res = await gateway.app.inject({
				method: 'PUT',
				url: '/sandboxes/nonexistent/egress',
				payload: { allowlist: ['example.com'] },
			})
			expect(res.statusCode).toBe(404)
		})

		it('should replace allowlist with explicit list', async () => {
			const sandbox = await createTestSandbox()
			const res = await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['api.github.com', 'npmjs.org'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toEqual(['api.github.com', 'npmjs.org'])
		})

		it('should deduplicate allowlist entries', async () => {
			const sandbox = await createTestSandbox()
			const res = await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['example.com', 'example.com', 'foo.com'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toEqual(['example.com', 'foo.com'])
		})
	})

	describe('POST /sandboxes/:sandboxId/egress/domains', () => {
		it('should return 404 for nonexistent sandbox', async () => {
			const res = await gateway.app.inject({
				method: 'POST',
				url: '/sandboxes/nonexistent/egress/domains',
				payload: { domains: ['example.com'] },
			})
			expect(res.statusCode).toBe(404)
		})

		it('should add domains to allowlist', async () => {
			const sandbox = await createTestSandbox()

			// Set initial allowlist
			await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['existing.com'] },
			})

			// Add new domains
			const res = await gateway.app.inject({
				method: 'POST',
				url: `/sandboxes/${sandbox.id}/egress/domains`,
				payload: { domains: ['new.com', 'another.com'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toContain('existing.com')
			expect(body.allowlist).toContain('new.com')
			expect(body.allowlist).toContain('another.com')
		})

		it('should deduplicate when adding existing domains', async () => {
			const sandbox = await createTestSandbox()

			await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['existing.com'] },
			})

			const res = await gateway.app.inject({
				method: 'POST',
				url: `/sandboxes/${sandbox.id}/egress/domains`,
				payload: { domains: ['existing.com', 'new.com'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toEqual(['existing.com', 'new.com'])
		})
	})

	describe('DELETE /sandboxes/:sandboxId/egress/domains', () => {
		it('should return 404 for nonexistent sandbox', async () => {
			const res = await gateway.app.inject({
				method: 'DELETE',
				url: '/sandboxes/nonexistent/egress/domains',
				payload: { domains: ['example.com'] },
			})
			expect(res.statusCode).toBe(404)
		})

		it('should remove domains from allowlist', async () => {
			const sandbox = await createTestSandbox()

			await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['keep.com', 'remove.com', 'also-keep.com'] },
			})

			const res = await gateway.app.inject({
				method: 'DELETE',
				url: `/sandboxes/${sandbox.id}/egress/domains`,
				payload: { domains: ['remove.com'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toEqual(['keep.com', 'also-keep.com'])
		})

		it('should handle removing nonexistent domains gracefully', async () => {
			const sandbox = await createTestSandbox()

			await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['keep.com'] },
			})

			const res = await gateway.app.inject({
				method: 'DELETE',
				url: `/sandboxes/${sandbox.id}/egress/domains`,
				payload: { domains: ['nonexistent.com'] },
			})
			const body = JSON.parse(res.body)

			expect(res.statusCode).toBe(200)
			expect(body.allowlist).toEqual(['keep.com'])
		})
	})

	describe('allowlist persistence', () => {
		it('should persist allowlist changes across GET calls', async () => {
			const sandbox = await createTestSandbox()

			await gateway.app.inject({
				method: 'PUT',
				url: `/sandboxes/${sandbox.id}/egress`,
				payload: { allowlist: ['persisted.com'] },
			})

			const res = await gateway.app.inject({
				method: 'GET',
				url: `/sandboxes/${sandbox.id}/egress`,
			})
			const body = JSON.parse(res.body)

			expect(body.allowlist).toEqual(['persisted.com'])
		})
	})
})
